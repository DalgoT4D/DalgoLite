from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import os
import json
import re
import pandas as pd
from datetime import datetime, timezone
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import gspread
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import create_tables, get_db, SheetRepository, ChartRepository, TransformationProjectRepository, JoinRepository, QualitativeDataRepository, ConnectedSheet, SavedChart, TransformationProject, TransformedDataWarehouse, PipelineExecutionHistory, AITransformationStep, JoinOperation, QualitativeDataOperation, CanvasNode, CanvasConnection, engine, User
from pydantic import BaseModel
import hashlib
import asyncio
import sqlite3

from llm_service import llm_service
from data_context import DataContextGenerator
from chart_service import ChartCreationService, get_chart_tools
from ai_transformation_service import ai_service
from qualitative_data_service import get_qualitative_service

# Create database tables
create_tables()

app = FastAPI(title="DalgoLite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3053", "https://dalgolite.dalgo.org"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3053')

# Health check endpoint (public)
@app.get("/health")
async def health_check():
    """Public health check endpoint"""
    from datetime import datetime
    return {
        "status": "healthy",
        "service": "DalgoLite API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "port": 8053
    }

# Google OAuth Configuration
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid'
]
CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI')

# In-memory storage for demo (use database in production)
user_credentials = {}

# Dependency to get current authenticated user
async def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get the currently authenticated user"""
    if 'current_user_id' not in user_credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = user_credentials.get('current_user_id')
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_refreshed_credentials():
    """Get Google credentials with automatic token refresh"""
    if 'default' not in user_credentials:
        return None
    
    try:
        creds = Credentials(**user_credentials['default'])
        
        # Check if token is expired and refresh if needed
        if creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            # Update stored credentials with new token
            user_credentials['default'] = {
                'token': creds.token,
                'refresh_token': creds.refresh_token,
                'token_uri': creds.token_uri,
                'client_id': creds.client_id,
                'client_secret': creds.client_secret,
                'scopes': creds.scopes
            }
        
        return creds
    except Exception as e:
        return None

# Pydantic models for API requests
class ChartCreateRequest(BaseModel):
    sheet_id: int
    chart_name: str
    chart_type: str
    x_axis_column: str
    y_axis_column: Optional[str] = None
    chart_config: Dict[str, Any] = {}

class ChartUpdateRequest(BaseModel):
    chart_name: Optional[str] = None
    chart_type: Optional[str] = None
    x_axis_column: Optional[str] = None
    y_axis_column: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None

class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    sheet_ids: List[int]

class JoinAnalysisRequest(BaseModel):
    sheet_ids: List[int]

class JoinKeyPair(BaseModel):
    left: str
    right: str

class JoinCreateRequest(BaseModel):
    project_id: int
    name: str
    output_table_name: Optional[str] = None
    left_table_id: int
    right_table_id: int
    left_table_type: str  # 'sheet' or 'transformation'
    right_table_type: str  # 'sheet' or 'transformation'
    join_type: str  # 'inner', 'left', 'right', 'full'
    join_keys: List[JoinKeyPair]
    canvas_position: Dict[str, int]

class ChatRequest(BaseModel):
    message: str
    chart_id: Optional[int] = None
    sheet_id: Optional[int] = None
    project_id: Optional[int] = None

class AITransformationRequest(BaseModel):
    project_id: int
    step_name: str
    user_prompt: str
    output_table_name: Optional[str] = None  # Custom output table name
    upstream_step_ids: Optional[List[int]] = []  # Legacy support
    upstream_sheet_ids: Optional[List[int]] = []  # Legacy support
    upstream_tables: Optional[List[Dict[str, Any]]] = []  # New unified format: [{"id": 1, "type": "sheet"}]
    canvas_position: Optional[Dict[str, float]] = {"x": 0, "y": 0}

class TransformationStepUpdateRequest(BaseModel):
    step_name: Optional[str] = None
    user_prompt: Optional[str] = None
    output_table_name: Optional[str] = None
    upstream_step_ids: Optional[List[int]] = None
    upstream_sheet_ids: Optional[List[int]] = None
    upstream_tables: Optional[List[Dict[str, Any]]] = None
    canvas_position: Optional[Dict[str, float]] = None

class QualitativeDataCreateRequest(BaseModel):
    project_id: int
    name: str
    source_table_id: int
    source_table_type: str  # 'sheet' or 'transformation'  
    qualitative_column: str
    analysis_type: str  # 'sentiment' or 'summarization'
    aggregation_column: Optional[str] = None  # Optional column for group-by summarization
    summarize_sentiment_analysis: Optional[bool] = None  # Whether to include sentiment stats
    sentiment_column: Optional[str] = None  # Column containing sentiment analysis results
    canvas_position: Dict[str, int]
    output_table_name: Optional[str] = None

class QualitativeDataUpdateRequest(BaseModel):
    name: Optional[str] = None
    source_table_id: Optional[int] = None
    source_table_type: Optional[str] = None
    qualitative_column: Optional[str] = None
    analysis_type: Optional[str] = None
    aggregation_column: Optional[str] = None
    summarize_sentiment_analysis: Optional[bool] = None
    sentiment_column: Optional[str] = None
    output_table_name: Optional[str] = None

class CanvasLayoutUpdateRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]

def load_table_data(table_id, table_type, current_user, db):
    """Load data from a single table of any type"""
    try:
        if table_type == 'sheet':
            sheet_repo = SheetRepository(db)
            sheet = sheet_repo.get_sheet_by_id(table_id, current_user.id)
            if sheet:
                return fetch_full_sheet_data(sheet)
                
        elif table_type == 'transformation':
            ai_step = db.query(AITransformationStep).filter(
                AITransformationStep.id == table_id,
                AITransformationStep.status == 'completed'
            ).first()
            if ai_step:
                table_name = getattr(ai_step, 'actual_table_name', None) or ai_step.output_table_name
                if table_name:
                    return pd.read_sql_table(table_name, engine)
                    
        elif table_type == 'join':
            join_op = db.query(JoinOperation).filter(
                JoinOperation.id == table_id,
                JoinOperation.status == 'completed'
            ).first()
            if join_op:
                table_name = getattr(join_op, 'actual_table_name', None) or join_op.output_table_name
                if table_name:
                    return pd.read_sql_table(table_name, engine)
                    
        elif table_type == 'qualitative':
            qual_op = db.query(QualitativeDataOperation).filter(
                QualitativeDataOperation.id == table_id,
                QualitativeDataOperation.status == 'completed'
            ).first()
            if qual_op:
                table_name = getattr(qual_op, 'actual_table_name', None) or qual_op.output_table_name
                if table_name:
                    return pd.read_sql_table(table_name, engine)
                    
    except Exception as e:
        print(f"Could not load {table_type} table {table_id}: {e}")
        
    return None

def get_table_columns(table_id, table_type, current_user, db):
    """Get available columns from a table of any type by reading from the actual database table"""
    print(f"DEBUG get_table_columns: table_id={table_id}, table_type={table_type}")
    try:
        if table_type == 'sheet':
            sheet_repo = SheetRepository(db)
            sheet = sheet_repo.get_sheet_by_id(table_id, current_user.id)
            if sheet and sheet.columns:
                return sheet.columns
                
        elif table_type in ['transformation', 'join', 'qualitative']:
            # For database tables, get the actual table name and fetch columns from it
            table_name = None
            
            if table_type == 'transformation':
                ai_step = db.query(AITransformationStep).filter(
                    AITransformationStep.id == table_id,
                    AITransformationStep.status == 'completed'
                ).first()
                if ai_step:
                    table_name = getattr(ai_step, 'actual_table_name', None) or ai_step.output_table_name
                    
            elif table_type == 'join':
                join_op = db.query(JoinOperation).filter(
                    JoinOperation.id == table_id,
                    JoinOperation.status == 'completed'
                ).first()
                if join_op:
                    table_name = getattr(join_op, 'actual_table_name', None) or join_op.output_table_name
                    
            elif table_type == 'qualitative':
                print(f"DEBUG: Looking for qualitative operation with id={table_id}")
                qual_op = db.query(QualitativeDataOperation).filter(
                    QualitativeDataOperation.id == table_id,
                    QualitativeDataOperation.status == 'completed'
                ).first()
                print(f"DEBUG: Found qualitative operation: {qual_op}")
                if qual_op:
                    table_name = getattr(qual_op, 'actual_table_name', None) or qual_op.output_table_name
                    print(f"DEBUG: Qualitative table_name: {table_name}")
            
            # If we have a table name, fetch columns from the actual database table
            if table_name:
                with engine.connect() as conn:
                    # Check if table exists
                    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name = :name"), 
                                        {"name": table_name})
                    if result.fetchone():
                        # Get column names from the table
                        result = conn.execute(text(f"PRAGMA table_info({table_name})"))
                        columns = [row[1] for row in result.fetchall()]  # column name is at index 1
                        return columns
                
    except Exception as e:
        print(f"Could not get columns for {table_type} table {table_id}: {e}")
        
    return []

def load_upstream_data(step, current_user, db):
    """Load data from upstream tables using unified upstream_tables format or legacy format"""
    sheet_data = {}
    
    # Try new unified format first
    if hasattr(step, 'upstream_tables') and step.upstream_tables:
        for table_ref in step.upstream_tables:
            table_id = table_ref['id']
            table_type = table_ref['type']
            
            df = load_table_data(table_id, table_type, current_user, db)
            if df is not None and not df.empty:
                sheet_data[f'{table_type}_{table_id}'] = df
    
    # Fallback to legacy format if no unified format or empty
    elif hasattr(step, 'upstream_sheet_ids') and step.upstream_sheet_ids:
        sheet_repo = SheetRepository(db)
        for sheet_id in step.upstream_sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            if sheet:
                df = fetch_full_sheet_data(sheet)
                if df is not None and not df.empty:
                    sheet_data[f'sheet_{sheet_id}'] = df
    
    return sheet_data

def extract_spreadsheet_id(input_str: str) -> str:
    """
    Extract spreadsheet ID from Google Sheets URL or return the input if it's already an ID.
    
    Handles various URL formats:
    - https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
    - https://docs.google.com/spreadsheets/d/SHEET_ID/edit
    - https://docs.google.com/spreadsheets/d/SHEET_ID
    - SHEET_ID (already an ID)
    """
    # If it looks like a URL, extract the ID
    if input_str.startswith('https://') or input_str.startswith('http://'):
        # Pattern to match Google Sheets URL and extract the ID
        pattern = r'/spreadsheets/d/([a-zA-Z0-9-_]+)'
        match = re.search(pattern, input_str)
        if match:
            return match.group(1)
        else:
            raise ValueError("Invalid Google Sheets URL format")
    
    # If it doesn't look like a URL, assume it's already an ID
    # Basic validation for Google Sheets ID format (alphanumeric, hyphens, underscores)
    if re.match(r'^[a-zA-Z0-9-_]+$', input_str.strip()):
        return input_str.strip()
    
    raise ValueError("Invalid spreadsheet ID or URL format")

@app.get("/")
async def root():
    return {"message": "DalgoLite API is running"}

@app.get("/auth/google")
async def google_auth():
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI]
            }
        },
        scopes=SCOPES
    )
    flow.redirect_uri = REDIRECT_URI
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='select_account'
    )
    
    return RedirectResponse(url=authorization_url)

@app.get("/auth/callback/google")
@app.get("/auth/google/callback")
async def auth_callback(code: str, state: str = None, db: Session = Depends(get_db)):
    try:

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [REDIRECT_URI]
                }
            },
            scopes=SCOPES
        )
        flow.redirect_uri = REDIRECT_URI

        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Get user info from Google
        service = build('oauth2', 'v2', credentials=credentials)
        user_info = service.userinfo().get().execute()

        # Check if user exists or create new one
        user = db.query(User).filter(User.google_id == user_info['id']).first()

        if not user:
            # New user - create account
            user = User(
                email=user_info.get('email'),
                google_id=user_info['id'],
                name=user_info.get('name', ''),
                picture_url=user_info.get('picture', ''),
                onboarding_completed=False,
                onboarding_step=0,
                login_count=1,
                first_login_at=datetime.now(timezone.utc),
                last_login_at=datetime.now(timezone.utc)
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new_user = True
        else:
            # Existing user - update last login and count
            user.last_login_at = datetime.now(timezone.utc)
            user.login_count = (user.login_count or 0) + 1
            user.updated_at = datetime.now(timezone.utc)
            db.commit()
            is_new_user = False

        # Store credentials with user ID
        user_credentials[str(user.id)] = {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes
        }

        # Also store as default for backward compatibility
        user_credentials['default'] = user_credentials[str(user.id)]

        # Store user ID in session (simplified - use proper session management in production)
        user_credentials['current_user_id'] = user.id

        # Redirect based on onboarding status
        if not user.onboarding_completed:
            return RedirectResponse(url=f"{FRONTEND_URL}/onboarding/onboarding_1?user_id={user.id}")
        else:
            return RedirectResponse(url=f"{FRONTEND_URL}/home?user_id={user.id}")

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/logout")
async def logout():
    """Clear user credentials and log out"""
    try:
        logout_url = None

        # If we have credentials, revoke the Google token
        if 'default' in user_credentials:
            try:
                creds = Credentials(**user_credentials['default'])
                # Revoke the token with Google
                revoke_url = f"https://oauth2.googleapis.com/revoke?token={creds.token}"
                import requests
                requests.post(revoke_url)

                # Provide Google logout URL to clear all Google sessions
                logout_url = "https://accounts.google.com/logout"
            except Exception as revoke_error:
                print(f"Error revoking token: {revoke_error}")

        # Clear stored credentials
        user_credentials.clear()

        return {
            "message": "Logged out successfully",
            "logout_url": logout_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/auth/status")
async def auth_status(db: Session = Depends(get_db)):
    """Check if user is authenticated and their onboarding status"""
    try:
        if 'current_user_id' not in user_credentials or 'default' not in user_credentials:
            return {"authenticated": False}

        # Get current user
        user_id = user_credentials.get('current_user_id')
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            return {"authenticated": False}

        # Optionally verify credentials are still valid
        creds = Credentials(**user_credentials['default'])
        if creds.expired and creds.refresh_token:
            # Try to refresh the token
            creds.refresh(GoogleRequest())
            # Update stored credentials
            user_credentials['default'] = {
                'token': creds.token,
                'refresh_token': creds.refresh_token,
                'token_uri': creds.token_uri,
                'client_id': creds.client_id,
                'client_secret': creds.client_secret,
                'scopes': creds.scopes
            }
            user_credentials[str(user_id)] = user_credentials['default']

        return {
            "authenticated": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "profile_picture": user.picture_url or user.profile_picture,
                "onboarding_completed": user.onboarding_completed,
                "onboarding_step": user.onboarding_step
            }
        }
    except Exception as e:
        # If there's any error with credentials, consider user not authenticated
        user_credentials.clear()
        return {"authenticated": False}

@app.post("/auth/clear")
async def clear_auth():
    """Clear stored credentials to force re-authentication"""
    user_credentials.clear()
    return {"message": "Credentials cleared successfully"}

# Onboarding endpoints
@app.get("/api/user/onboarding-status")
async def get_onboarding_status(db: Session = Depends(get_db)):
    """Get current user's onboarding status"""
    if 'current_user_id' not in user_credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = user_credentials.get('current_user_id')
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Parse JSON data
        import json
        onboarding_data = {}
        if user.onboarding_data:
            try:
                onboarding_data = json.loads(user.onboarding_data)
            except:
                onboarding_data = {}

        return {
            "onboarding_completed": user.onboarding_completed,
            "onboarding_step": user.onboarding_step,
            "onboarding_data": onboarding_data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/update-onboarding")
async def update_onboarding(update_data: Dict[str, Any], db: Session = Depends(get_db)):
    """Update user's onboarding progress"""
    if 'current_user_id' not in user_credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = user_credentials.get('current_user_id')
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Update onboarding fields
        if 'step' in update_data:
            user.onboarding_step = update_data['step']

        if 'completed' in update_data:
            user.onboarding_completed = update_data['completed']

        if 'data' in update_data:
            # Merge new data with existing
            import json
            existing_data = {}
            if user.onboarding_data:
                try:
                    existing_data = json.loads(user.onboarding_data)
                except:
                    existing_data = {}
            existing_data.update(update_data['data'])
            user.onboarding_data = json.dumps(existing_data)

        db.commit()

        return {
            "success": True,
            "onboarding_completed": user.onboarding_completed,
            "onboarding_step": user.onboarding_step
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/complete-onboarding")
async def complete_onboarding(db: Session = Depends(get_db)):
    """Mark onboarding as complete"""
    if 'current_user_id' not in user_credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = user_credentials.get('current_user_id')
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.onboarding_completed = True
        db.commit()

        return {"success": True, "message": "Onboarding completed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sheets/list")
async def list_sheets():
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        creds = Credentials(**user_credentials['default'])
        service = build('sheets', 'v4', credentials=creds)
        
        # This is a simplified version - in reality you'd need to list files from Drive API
        return {"message": "Connected to Google Sheets API successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sheets/analyze")
async def analyze_sheet(
    sheet_data: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        
        spreadsheet_input = sheet_data.get('spreadsheet_id')
        range_name = sheet_data.get('range', 'Sheet1!A:Z')
        
        
        if not spreadsheet_input:
            raise HTTPException(status_code=400, detail="Spreadsheet ID or URL is required")
        
        # Extract spreadsheet ID from URL or validate existing ID
        try:
            spreadsheet_id = extract_spreadsheet_id(spreadsheet_input)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        creds = get_refreshed_credentials()
        if creds is None:
            raise HTTPException(status_code=500, detail="Could not get valid credentials")
        service = build('sheets', 'v4', credentials=creds)
        
        # Get spreadsheet metadata for title
        try:
            spreadsheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            spreadsheet_title = spreadsheet_metadata.get('properties', {}).get('title', 'Untitled Sheet')
        except Exception as metadata_error:
            # Try to get basic info from Drive API as fallback
            try:
                drive_service = build('drive', 'v3', credentials=creds)
                file_info = drive_service.files().get(fileId=spreadsheet_id, fields='name,mimeType').execute()
                spreadsheet_title = file_info.get('name', 'Unknown Sheet')
                mime_type = file_info.get('mimeType', '')
                
                if mime_type != 'application/vnd.google-apps.spreadsheet':
                    raise HTTPException(
                        status_code=400, 
                        detail=f"This file is not a Google Sheets document (found: {mime_type}). Please make sure you're connecting to a Google Sheets file, not an Excel or other file type."
                    )
            except Exception as drive_error:
                raise HTTPException(
                    status_code=400, 
                    detail="Unable to access this document. Please ensure: 1) The link is for a Google Sheets file (not Excel), 2) The sheet is shared with appropriate permissions, 3) The sheet exists and is accessible."
                )
        
        # Get sheet data - try different range formats
        sheet = service.spreadsheets()
        
        # Get actual sheet name first
        actual_sheet_name = 'Sheet1'  # fallback
        try:
            sheets = spreadsheet_metadata.get('sheets', [])
            if sheets:
                actual_sheet_name = sheets[0]['properties']['title']
        except Exception:
            pass
        
        # Try multiple range formats in order of preference
        range_attempts = [
            f"{actual_sheet_name}!A:Z",  # Use actual sheet name
            range_name,  # Original range (might be Sheet1!A:Z)
            'A:Z',       # Without sheet name
            'A1:Z1000',  # Specific range
            '',          # Empty range (gets all data)
        ]
        
        result = None
        successful_range = None
        
        for attempt_range in range_attempts:
            try:
                if attempt_range:
                    result = sheet.values().get(spreadsheetId=spreadsheet_id, range=attempt_range).execute()
                else:
                    # Try to get spreadsheet metadata first to find the correct sheet name
                    sheets = spreadsheet_metadata.get('sheets', [])
                    if sheets:
                        actual_sheet_name = sheets[0]['properties']['title']
                        actual_range = f"{actual_sheet_name}!A:Z"
                        result = sheet.values().get(spreadsheetId=spreadsheet_id, range=actual_range).execute()
                
                successful_range = attempt_range
                break
                
            except Exception as range_error:
                continue
        
        if result is None:
            raise HTTPException(status_code=400, detail="Unable to access sheet data. Please check if the sheet is publicly accessible.")
        
        values = result.get('values', [])
        
        if not values:
            raise HTTPException(status_code=400, detail="No data found in sheet")
        
        # Save to database
        sheet_repo = SheetRepository(db)
        columns = values[0] if values else []
        sample_data = values[:10]  # Store first 10 rows for display
        
        saved_sheet = sheet_repo.create_or_update_sheet(
            user_id=current_user.id,
            spreadsheet_id=spreadsheet_id,
            spreadsheet_url=spreadsheet_input,
            sheet_name=actual_sheet_name,
            title=spreadsheet_title,
            columns=columns,
            sample_data=sample_data,
            total_rows=len(values)
        )
        
        # Store FULL data in warehouse for transformations, joins, and charts
        if len(values) > 1:  # Only if there's actual data beyond headers
            df = pd.DataFrame(values[1:], columns=columns)  # Skip header row
            warehouse_table_name = f"sheet_{saved_sheet.id}_{saved_sheet.title.lower().replace(' ', '_').replace('-', '_')}"
            import re
            warehouse_table_name = re.sub(r'[^\w]', '_', warehouse_table_name)
            
            # Store the full sheet data in the warehouse
            try:
                df.to_sql(warehouse_table_name, engine, if_exists='replace', index=False)
            except Exception as warehouse_error:
                # Continue anyway - this is not a critical error for the initial connection
                pass
        
        # Generate chart recommendations
        recommendations = generate_chart_recommendations(values)
        
        return {
            "sheet_id": saved_sheet.id,
            "data": values[:10],  # Return first 10 rows
            "recommendations": recommendations,
            "total_rows": len(values),
            "columns": values[0] if values else [],
            "title": spreadsheet_title
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e))

def generate_chart_recommendations(values: List[List[str]]) -> List[Dict[str, Any]]:
    recommendations = []
    
    if not values or len(values) < 2:
        return recommendations
    
    headers = values[0]
    data_rows = values[1:]
    
    # Analyze data types by examining sample values
    numeric_columns = []
    categorical_columns = []
    text_columns = []
    id_columns = []
    status_columns = []
    
    for i, header in enumerate(headers):
        sample_values = [row[i] for row in data_rows[:10] if i < len(row) and row[i]]  # Sample first 10 rows
        if not sample_values:
            continue
            
        header_lower = header.lower()
        
        # Check if numeric
        numeric_count = 0
        for val in sample_values:
            try:
                float(val)
                numeric_count += 1
            except (ValueError, TypeError):
                pass
        
        is_numeric = numeric_count > len(sample_values) * 0.7
        
        # Categorize columns
        if is_numeric:
            numeric_columns.append(header)
        elif 'id' in header_lower or header_lower.endswith('_id') or header_lower.startswith('id_'):
            id_columns.append(header)
        elif 'status' in header_lower or 'state' in header_lower:
            status_columns.append(header)
        elif any(word in header_lower for word in ['title', 'name', 'description', 'url', 'email']):
            text_columns.append(header)
        else:
            categorical_columns.append(header)
    
    # Generate universal recommendations that work with any data
    
    # 1. Status/Category distribution (most common pattern)
    if categorical_columns:
        main_cat = categorical_columns[0]
        recommendations.append({
            "type": "pie",
            "title": f"Distribution of {main_cat}",
            "description": f"See the breakdown of different {main_cat.lower()} values",
            "x_axis": main_cat,
            "y_axis": None,
            "reason": f"Understand the distribution of {main_cat.lower()} in your data"
        })
        
        recommendations.append({
            "type": "bar",
            "title": f"Count by {main_cat}",
            "description": f"Count of items for each {main_cat.lower()}",
            "x_axis": main_cat,
            "y_axis": None,
            "reason": f"Compare quantities across different {main_cat.lower()}"
        })
    
    # 2. Numeric analysis
    if len(numeric_columns) >= 1:
        num_col = numeric_columns[0]
        recommendations.append({
            "type": "histogram",
            "title": f"Distribution of {num_col}",
            "description": f"See how {num_col.lower()} values are distributed",
            "x_axis": num_col,
            "y_axis": None,
            "reason": f"Understand the spread and patterns in {num_col.lower()}"
        })
    
    # 3. Numeric vs Categorical
    if len(numeric_columns) >= 1 and len(categorical_columns) >= 1:
        num_col = numeric_columns[0]
        cat_col = categorical_columns[0]
        recommendations.append({
            "type": "bar",
            "title": f"{num_col} by {cat_col}",
            "description": f"Compare {num_col.lower()} across different {cat_col.lower()}",
            "x_axis": cat_col,
            "y_axis": num_col,
            "reason": f"See how {num_col.lower()} varies by {cat_col.lower()}"
        })
    
    # 4. Two numeric columns correlation
    if len(numeric_columns) >= 2:
        recommendations.append({
            "type": "scatter",
            "title": f"{numeric_columns[0]} vs {numeric_columns[1]}",
            "description": f"Relationship between {numeric_columns[0]} and {numeric_columns[1]}",
            "x_axis": numeric_columns[0],
            "y_axis": numeric_columns[1],
            "reason": "Identify potential correlations between these numeric values"
        })
    
    # 5. Status-specific recommendations
    if status_columns and categorical_columns:
        status_col = status_columns[0]
        recommendations.append({
            "type": "pie",
            "title": f"{status_col} Overview",
            "description": f"Current state breakdown by {status_col.lower()}",
            "x_axis": status_col,
            "y_axis": None,
            "reason": f"Monitor the current {status_col.lower()} distribution"
        })
        
        if len(categorical_columns) >= 1:
            cat_col = next((c for c in categorical_columns if c != status_col), categorical_columns[0])
            recommendations.append({
                "type": "bar",
                "title": f"{status_col} by {cat_col}",
                "description": f"See {status_col.lower()} breakdown for each {cat_col.lower()}",
                "x_axis": cat_col,
                "y_axis": status_col,
                "reason": f"Understand how {status_col.lower()} varies across {cat_col.lower()}"
            })
    
    # 6. Multiple categorical analysis
    if len(categorical_columns) >= 2:
        cat1, cat2 = categorical_columns[0], categorical_columns[1]
        recommendations.append({
            "type": "bar",
            "title": f"{cat2} Distribution by {cat1}",
            "description": f"See how {cat2.lower()} varies across different {cat1.lower()}",
            "x_axis": cat1,
            "y_axis": cat2,
            "reason": f"Analyze the relationship between {cat1.lower()} and {cat2.lower()}"
        })
    
    # Ensure we always have at least basic recommendations
    if not recommendations and len(headers) >= 1:
        recommendations.append({
            "type": "bar",
            "title": f"Overview of {headers[0]}",
            "description": f"Basic analysis of {headers[0]}",
            "x_axis": headers[0],
            "y_axis": None,
            "reason": "Get started with analyzing your data"
        })
    
    return recommendations[:6]  # Return top 6 recommendations

# Database endpoints for sheets
@app.get("/sheets/connected")
async def get_connected_sheets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all connected sheets from database for the current user"""
    try:
        sheet_repo = SheetRepository(db)
        sheets = sheet_repo.get_all_sheets(current_user.id)
        
        return {
            "sheets": [
                {
                    "id": sheet.id,
                    "spreadsheet_id": sheet.spreadsheet_id,
                    "spreadsheet_url": sheet.spreadsheet_url,
                    "title": sheet.title,
                    "sheet_name": sheet.sheet_name,
                    "connected_at": sheet.connected_at.isoformat() + 'Z',
                    "last_synced": sheet.last_synced.isoformat() + 'Z',
                    "total_rows": sheet.total_rows,
                    "columns": sheet.columns,
                    "sample_data": sheet.sample_data[:5] if sheet.sample_data else []  # First 5 rows
                }
                for sheet in sheets
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sheets/{sheet_id}")
async def get_sheet_details(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get detailed information about a specific sheet"""
    try:
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        return {
            "id": sheet.id,
            "spreadsheet_id": sheet.spreadsheet_id,
            "spreadsheet_url": sheet.spreadsheet_url,
            "title": sheet.title,
            "sheet_name": sheet.sheet_name,
            "connected_at": sheet.connected_at.isoformat() + 'Z',
            "last_synced": sheet.last_synced.isoformat() + 'Z',
            "total_rows": sheet.total_rows,
            "columns": sheet.columns,
            "sample_data": sheet.sample_data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sheets/{sheet_id}/sync")
async def sync_sheet(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Re-sync a sheet with Google Sheets to get latest data"""
    try:
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Re-analyze the sheet to get fresh data
        sheet_data = {
            "spreadsheet_id": sheet.spreadsheet_id,
            "range": f"{sheet.sheet_name}!A:Z"
        }
        
        # Call the analyze_sheet function to update data
        result = await analyze_sheet(sheet_data, db)
        
        return {
            "message": "Sheet synced successfully",
            "sheet_id": result["sheet_id"],
            "total_rows": result["total_rows"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sheets/{sheet_id}/recommendations")
async def get_sheet_recommendations(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get chart recommendations for a specific sheet"""
    try:
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        # Generate recommendations based on stored sample data
        if sheet.sample_data and len(sheet.sample_data) > 1:
            recommendations = generate_chart_recommendations(sheet.sample_data)
            return {"recommendations": recommendations}
        else:
            return {"recommendations": []}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sheets/{sheet_id}/resync")
async def resync_sheet_data(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Resync data from Google Sheets for an existing connected sheet"""
    try:
        sheet_repo = SheetRepository(db)
        existing_sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
        
        if not existing_sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        # Check authentication
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated with Google")
        
        # Build the service with stored credentials and automatic refresh
        creds = get_refreshed_credentials()
        if creds is None:
            raise HTTPException(status_code=500, detail="Could not get valid credentials")
        service = build('sheets', 'v4', credentials=creds)
        
        try:
            # Get fresh data from Google Sheets
            sheet = service.spreadsheets()
            
            # Use the same range detection logic as in analyze_sheet
            range_attempts = [
                f"{existing_sheet.sheet_name}!A:Z",  # Try with known sheet name
                'A:Z',       # Without sheet name
                'A1:Z1000',  # Specific range
            ]
            
            result = None
            successful_range = None
            
            for attempt_range in range_attempts:
                try:
                    result = sheet.values().get(spreadsheetId=existing_sheet.spreadsheet_id, range=attempt_range).execute()
                    successful_range = attempt_range
                    break
                except Exception as range_error:
                    continue
            
            if result is None:
                raise HTTPException(status_code=400, detail="Unable to access sheet data. Please check if the sheet is still accessible.")
            
            values = result.get('values', [])
            
            if not values:
                raise HTTPException(status_code=400, detail="No data found in sheet")
            
            # Update the existing sheet with fresh data
            columns = values[0] if values else []
            sample_data = values[:10]  # Store first 10 rows
            
            updated_sheet = sheet_repo.create_or_update_sheet(
                spreadsheet_id=existing_sheet.spreadsheet_id,
                spreadsheet_url=existing_sheet.spreadsheet_url,
                title=existing_sheet.title,
                sheet_name=existing_sheet.sheet_name,
                columns=columns,
                sample_data=sample_data,
                total_rows=len(values)
            )
            
            return {
                "message": "Sheet data resynced successfully",
                "sheet": {
                    "id": updated_sheet.id,
                    "title": updated_sheet.title,
                    "sheet_name": updated_sheet.sheet_name,
                    "total_rows": updated_sheet.total_rows,
                    "columns": updated_sheet.columns,
                    "last_synced": updated_sheet.last_synced.isoformat() + 'Z'
                }
            }
            
        except Exception as sheets_error:
            print(f"ERROR calling Google Sheets API: {sheets_error}")
            raise HTTPException(status_code=400, detail=f"Failed to access Google Sheets: {str(sheets_error)}")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in resync_sheet_data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sheets/{sheet_id}")
async def delete_sheet(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a connected sheet and all its charts"""
    try:
        # Check if sheet exists and belongs to current user
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)

        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")

        # Check if sheet is used in any transformation projects (only user's projects)
        project_repo = TransformationProjectRepository(db)
        projects_using_sheet = db.query(TransformationProject).filter(
            TransformationProject.user_id == current_user.id,
            TransformationProject.sheet_ids.contains([sheet_id])
        ).all()
        
        if projects_using_sheet:
            project_names = [project.name for project in projects_using_sheet]
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete sheet. It is used in transformation projects: {', '.join(project_names)}. Please delete these projects first."
            )
        
        # Proceed with deletion if no transformation projects use this sheet
        success = sheet_repo.delete_sheet(sheet_id, current_user.id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete sheet")
        
        return {"message": "Sheet deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Chart endpoints
@app.get("/sheets/{sheet_id}/charts")
async def get_sheet_charts(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all charts for a specific sheet"""
    try:
        chart_repo = ChartRepository(db)
        charts = chart_repo.get_charts_by_sheet(current_user.id, sheet_id)
        
        chart_list = []
        for chart in charts:
            try:
                # Handle chart_config parsing safely
                if isinstance(chart.chart_config, str):
                    try:
                        chart_config = json.loads(chart.chart_config)
                    except json.JSONDecodeError:
                        chart_config = {}
                elif isinstance(chart.chart_config, dict):
                    chart_config = chart.chart_config
                else:
                    chart_config = {}
                
                chart_list.append({
                    "id": chart.id,
                    "chart_name": chart.chart_name,
                    "chart_type": chart.chart_type,
                    "x_axis_column": chart.x_axis_column,
                    "y_axis_column": chart.y_axis_column,
                    "chart_config": chart_config,
                    "created_at": chart.created_at.isoformat(),
                    "updated_at": chart.updated_at.isoformat()
                })
            except Exception as chart_error:
                print(f"Error processing chart {chart.id}: {chart_error}")
                continue
        
        return {"charts": chart_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/charts")
async def create_chart(chart_request: ChartCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new chart"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.create_chart(
            user_id=current_user.id,
            sheet_id=chart_request.sheet_id,
            chart_name=chart_request.chart_name,
            chart_type=chart_request.chart_type,
            x_axis_column=chart_request.x_axis_column,
            y_axis_column=chart_request.y_axis_column,
            chart_config=chart_request.chart_config
        )
        
        return {
            "id": chart.id,
            "chart_name": chart.chart_name,
            "chart_type": chart.chart_type,
            "x_axis_column": chart.x_axis_column,
            "y_axis_column": chart.y_axis_column,
            "chart_config": chart.chart_config,
            "created_at": chart.created_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/charts/{chart_id}")
async def get_chart(chart_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific chart"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.get_chart_by_id(current_user.id, chart_id)

        if not chart:
            raise HTTPException(status_code=404, detail="Chart not found")
        
        return {
            "id": chart.id,
            "sheet_id": chart.sheet_id,
            "chart_name": chart.chart_name,
            "chart_type": chart.chart_type,
            "x_axis_column": chart.x_axis_column,
            "y_axis_column": chart.y_axis_column,
            "chart_config": chart.chart_config,
            "created_at": chart.created_at.isoformat(),
            "updated_at": chart.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/charts/{chart_id}")
async def update_chart(chart_id: int, chart_request: ChartUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing chart"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.update_chart(
            user_id=current_user.id,
            chart_id=chart_id,
            chart_name=chart_request.chart_name,
            chart_type=chart_request.chart_type,
            x_axis_column=chart_request.x_axis_column,
            y_axis_column=chart_request.y_axis_column,
            chart_config=chart_request.chart_config
        )
        
        if not chart:
            raise HTTPException(status_code=404, detail="Chart not found")
        
        return {
            "id": chart.id,
            "chart_name": chart.chart_name,
            "chart_type": chart.chart_type,
            "x_axis_column": chart.x_axis_column,
            "y_axis_column": chart.y_axis_column,
            "chart_config": chart.chart_config,
            "updated_at": chart.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/charts/{chart_id}")
async def delete_chart(chart_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a chart"""
    try:
        chart_repo = ChartRepository(db)
        success = chart_repo.delete_chart(current_user.id, chart_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Chart not found")
        
        return {"message": "Chart deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/charts")
async def get_all_charts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all charts across all sources with metadata"""
    try:
        chart_repo = ChartRepository(db)
        sheet_repo = SheetRepository(db)

        # Get all charts for the current user
        charts = chart_repo.get_all_charts(current_user.id)
        
        enriched_charts = []
        for chart in charts:
            chart_data = {
                "id": chart.id,
                "chart_name": chart.chart_name,
                "chart_type": chart.chart_type,
                "x_axis_column": chart.x_axis_column,
                "y_axis_column": chart.y_axis_column,
                "chart_config": chart.chart_config,
                "created_at": chart.created_at.isoformat(),
                "updated_at": chart.updated_at.isoformat(),
                "source_type": None,
                "source_name": "Unknown Source",
                "source_id": None
            }
            
            # Add source metadata
            if chart.sheet_id:
                sheet = sheet_repo.get_sheet_by_id(chart.sheet_id, current_user.id)
                if sheet:
                    chart_data.update({
                        "source_type": "sheet",
                        "source_name": sheet.title,
                        "source_id": chart.sheet_id
                    })
            elif chart.project_id:
                # Get project info
                project = db.query(TransformationProject).filter(TransformationProject.id == chart.project_id).first()
                if project:
                    chart_data.update({
                        "source_type": "project", 
                        "source_name": project.name,
                        "source_id": chart.project_id
                    })
            
            enriched_charts.append(chart_data)
        
        return {"charts": enriched_charts}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Unified chart creation endpoint
class UnifiedChartCreateRequest(BaseModel):
    chart_name: str
    chart_type: str
    x_axis_column: Optional[str] = None  # Optional for table charts
    y_axis_column: Optional[str] = None
    chart_config: Optional[dict] = {}
    # Source identification
    source_type: str  # 'sheet', 'transformation', 'join', 'qualitative'
    source_id: int    # ID of the source (sheet_id, step_id, join_id)
    project_id: Optional[int] = None  # Required for transformation/join sources


def fetch_source_values_for_chart(source_type: str, source_id: int, current_user: User, db: Session):
    """Load tabular data for the provided chart source"""
    if source_type == "sheet":
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(source_id, current_user.id)
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")

        creds = get_refreshed_credentials()
        if creds is None:
            raise HTTPException(status_code=500, detail="Could not get valid credentials")

        try:
            service = build('sheets', 'v4', credentials=creds)
            try:
                result = service.spreadsheets().values().get(
                    spreadsheetId=sheet.spreadsheet_id,
                    range=f"'{sheet.sheet_name}'!A:ZZ"
                ).execute()
            except Exception as range_error:
                try:
                    result = service.spreadsheets().values().get(
                        spreadsheetId=sheet.spreadsheet_id,
                        range="A:ZZ"
                    ).execute()
                except Exception as fallback_error:
                    raise Exception(f"Range parsing failed: {str(range_error)}. Fallback also failed: {str(fallback_error)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch sheet data: {str(e)}")

        return result.get('values', [])

    if source_type == "join":
        join_repo = JoinRepository(db)
        join_op = join_repo.get_join_by_id(source_id)
        if not join_op or join_op.status != 'completed':
            raise HTTPException(status_code=404, detail="Join operation not completed")

        with engine.connect() as conn:
            result = conn.execute(text(f"SELECT * FROM {join_op.output_table_name}"))
            rows = result.fetchall()
            columns = list(result.keys())
        return [columns] + [list(row) for row in rows]

    if source_type == "transformation":
        step = db.query(AITransformationStep).filter(
            AITransformationStep.id == source_id
        ).first()
        if not step or step.status != 'completed':
            raise HTTPException(status_code=404, detail="Transformation step not completed")

        table_name = f"transform_step_{source_id}"
        with engine.connect() as conn:
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE :pattern"),
                                  {"pattern": f"%{table_name}%"})
            table_names = [row[0] for row in result.fetchall()]
            if not table_names:
                raise HTTPException(status_code=404, detail="Transformation output table not found")

            result = conn.execute(text(f"SELECT * FROM {table_names[0]}"))
            rows = result.fetchall()
            columns = list(result.keys())

        return [columns] + [list(row) for row in rows]

    if source_type == "qualitative":
        qual_op = db.query(QualitativeDataOperation).filter(
            QualitativeDataOperation.id == source_id
        ).first()
        if not qual_op or qual_op.status != 'completed':
            raise HTTPException(status_code=404, detail="Qualitative operation not completed")

        with engine.connect() as conn:
            result = conn.execute(text(f"SELECT * FROM {qual_op.output_table_name}"))
            rows = result.fetchall()
            columns = list(result.keys())

        return [columns] + [list(row) for row in rows]

    raise HTTPException(status_code=400, detail="Chart has no valid data source")


def find_duplicate_values(records: List[Dict[str, Any]], unique_column: str) -> List[str]:
    """Identify duplicate entries in the provided unique column"""
    def normalize(value: Any):
        if value is None:
            return None
        if isinstance(value, str):
            return value.strip().lower()
        return str(value)

    seen = {}
    duplicates = set()

    for record in records:
        original_value = record.get(unique_column)
        key = normalize(original_value)
        if key in seen:
            duplicates.add(key)
        else:
            seen[key] = original_value

    duplicate_values = []
    for key in duplicates:
        original_value = seen.get(key)
        if original_value is None or (isinstance(original_value, str) and original_value.strip() == ''):
            duplicate_values.append('[blank]')
        else:
            duplicate_values.append(str(original_value))

    return duplicate_values

@app.post("/charts/unified")
async def create_unified_chart(chart_request: UnifiedChartCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a chart from any source type (sheet, AI transformation, join, qualitative)"""
    try:
        
        chart_repo = ChartRepository(db)
        
        # Validate source exists and determine chart associations
        sheet_id = None
        project_id = chart_request.project_id
        
        if chart_request.source_type == "sheet":
            sheet_repo = SheetRepository(db)
            sheet = sheet_repo.get_sheet_by_id(chart_request.source_id, current_user.id)
            if not sheet:
                raise HTTPException(status_code=404, detail="Sheet not found")
            sheet_id = chart_request.source_id
            
        elif chart_request.source_type == "transformation":
            # Validate transformation step exists (any project)
            step = db.query(AITransformationStep).filter(
                AITransformationStep.id == chart_request.source_id
            ).first()
            if not step:
                raise HTTPException(status_code=404, detail="Transformation step not found")
                
        elif chart_request.source_type == "join":
            # Validate join exists (any project) 
            join_repo = JoinRepository(db)
            join_op = join_repo.get_join_by_id(chart_request.source_id)
            if not join_op:
                raise HTTPException(status_code=404, detail="Join operation not found")
                
        elif chart_request.source_type == "qualitative":
            # Validate qualitative operation exists
            qual_op = db.query(QualitativeDataOperation).filter(
                QualitativeDataOperation.id == chart_request.source_id
            ).first()
            if not qual_op:
                raise HTTPException(status_code=404, detail="Qualitative operation not found")
        else:
            raise HTTPException(status_code=400, detail="Invalid source_type. Must be 'sheet', 'transformation', 'join', or 'qualitative'")

        chart_type_lower = chart_request.chart_type.lower()

        # Store source info in chart config for data retrieval
        chart_config = chart_request.chart_config or {}

        if chart_type_lower == 'qualitative_cards':
            unique_column = chart_config.get('unique_column')
            qualitative_column = chart_config.get('qualitative_column')
            quantitative_columns = chart_config.get('quantitative_columns') or []
            quantitative_labels_input = chart_config.get('quantitative_labels') or []
            value_formatting = chart_config.get('value_formatting') or {}

            if not unique_column or not isinstance(unique_column, str):
                raise HTTPException(status_code=400, detail="Qualitative Cards require a unique identifier column")
            if not qualitative_column or not isinstance(qualitative_column, str):
                raise HTTPException(status_code=400, detail="Qualitative Cards require a qualitative text column")

            quantitative_columns = [col for col in quantitative_columns if isinstance(col, str) and col.strip()]
            if len(quantitative_columns) > 2:
                quantitative_columns = quantitative_columns[:2]

            quantitative_labels = []
            for idx, col in enumerate(quantitative_columns):
                label = None
                if idx < len(quantitative_labels_input):
                    label = quantitative_labels_input[idx]
                if isinstance(label, str) and label.strip():
                    quantitative_labels.append(label.strip())
                else:
                    quantitative_labels.append(col)

            # Ensure formatting is a dict limited to selected columns
            sanitized_formatting = {}
            if isinstance(value_formatting, dict):
                for col in quantitative_columns:
                    fmt = value_formatting.get(col)
                    if isinstance(fmt, str) and fmt.strip():
                        sanitized_formatting[col] = fmt.strip()

            values = fetch_source_values_for_chart(chart_request.source_type, chart_request.source_id, current_user, db)
            if not values or len(values) < 2:
                raise HTTPException(status_code=400, detail="No data available to validate Qualitative Cards")

            headers = values[0]
            data_rows = values[1:]

            if unique_column not in headers:
                raise HTTPException(status_code=400, detail=f"Column '{unique_column}' not found in data source")
            if qualitative_column not in headers:
                raise HTTPException(status_code=400, detail=f"Column '{qualitative_column}' not found in data source")
            for col in quantitative_columns:
                if col not in headers:
                    raise HTTPException(status_code=400, detail=f"Quantitative column '{col}' not found in data source")

            records = []
            for row in data_rows:
                if not row:
                    continue
                record = {}
                for idx, header in enumerate(headers):
                    record[header] = row[idx] if idx < len(row) else None
                records.append(record)

            duplicates = find_duplicate_values(records, unique_column)
            if duplicates:
                duplicate_preview = ", ".join(duplicates[:5])
                suffix = "..." if len(duplicates) > 5 else ""
                raise HTTPException(
                    status_code=400,
                    detail=f"Column '{unique_column}' must contain unique values. Duplicates found: {duplicate_preview}{suffix}"
                )

            chart_config['unique_column'] = unique_column
            chart_config['qualitative_column'] = qualitative_column
            chart_config['quantitative_columns'] = quantitative_columns
            chart_config['quantitative_labels'] = quantitative_labels
            chart_config['value_formatting'] = sanitized_formatting
            chart_config['source_type'] = chart_request.source_type
            chart_config['source_id'] = chart_request.source_id

            x_axis_column = unique_column
            y_axis_column = None
        else:
            chart_config.update({
                "source_type": chart_request.source_type,
                "source_id": chart_request.source_id
            })
            x_axis_column = chart_request.x_axis_column
            y_axis_column = chart_request.y_axis_column
        
        # Create chart (unified charts don't need project_id)
        chart_id = chart_repo.create_chart(
            user_id=current_user.id,
            sheet_id=sheet_id,
            chart_name=chart_request.chart_name,
            chart_type=chart_request.chart_type,
            x_axis_column=x_axis_column,
            y_axis_column=y_axis_column,
            chart_config=chart_config,
            project_id=None  # Unified charts are project-agnostic
        )
        
        return {
            "chart_id": chart_id,
            "message": "Chart created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/charts/{chart_id}/data")
async def get_chart_data(chart_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get chart data for visualization"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.get_chart_by_id(current_user.id, chart_id)

        if not chart:
            raise HTTPException(status_code=404, detail="Chart not found")

        # Get data based on chart source (check config first, then fallback to legacy fields)
        source_type = chart.chart_config.get("source_type")
        source_id = chart.chart_config.get("source_id")

        if source_type == "sheet" or chart.sheet_id:
            # Get data from Google Sheet
            sheet_id = source_id or chart.sheet_id
            sheet_repo = SheetRepository(db)
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            if not sheet:
                raise HTTPException(status_code=404, detail="Sheet not found")
            
            # Fetch fresh data from Google Sheets
            try:
                creds = get_refreshed_credentials()
                if creds is None:
                    raise HTTPException(status_code=500, detail="Could not get valid credentials")
                service = build('sheets', 'v4', credentials=creds)
                
                # Try different range formats if the sheet name has issues
                try:
                    result = service.spreadsheets().values().get(
                        spreadsheetId=sheet.spreadsheet_id,
                        range=f"'{sheet.sheet_name}'!A:ZZ"  # Quote the sheet name
                    ).execute()
                except Exception as range_error:
                    try:
                        # Try without sheet name, just get all data
                        result = service.spreadsheets().values().get(
                            spreadsheetId=sheet.spreadsheet_id,
                            range="A:ZZ"
                        ).execute()
                    except Exception as fallback_error:
                        raise Exception(f"Range parsing failed: {str(range_error)}. Fallback also failed: {str(fallback_error)}")
                
                values = result.get('values', [])
                if not values:
                    raise HTTPException(status_code=404, detail="No data found in sheet")
                    
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to fetch sheet data: {str(e)}")
                
        elif source_type == "join":
            # Get data from specific join table
            try:
                join_repo = JoinRepository(db) 
                join_op = join_repo.get_join_by_id(source_id)
                if not join_op or join_op.status != 'completed':
                    raise HTTPException(status_code=404, detail="Join operation not completed")
                    
                with engine.connect() as conn:
                    result = conn.execute(text(f"SELECT * FROM {join_op.output_table_name} LIMIT 1000"))
                    rows = result.fetchall()
                    
                    if not rows:
                        raise HTTPException(status_code=404, detail="No data in join table")
                    
                    columns = list(result.keys())
                    values = [columns] + [list(row) for row in rows]
                    
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to fetch join data: {str(e)}")
                
        elif source_type == "transformation":
            # Get data from specific transformation table  
            try:
                step = db.query(AITransformationStep).filter(
                    AITransformationStep.id == source_id
                ).first()
                if not step or step.status != 'completed':
                    raise HTTPException(status_code=404, detail="Transformation step not completed")
                    
                # Find the transformation output table
                table_name = f"transform_step_{source_id}"
                with engine.connect() as conn:
                    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE :pattern"), 
                                        {"pattern": f"%{table_name}%"})
                    table_names = [row[0] for row in result.fetchall()]
                    if not table_names:
                        raise HTTPException(status_code=404, detail="Transformation output table not found")
                        
                    result = conn.execute(text(f"SELECT * FROM {table_names[0]} LIMIT 1000"))
                    rows = result.fetchall()
                    
                    if not rows:
                        raise HTTPException(status_code=404, detail="No data in transformation table")
                    
                    columns = list(result.keys())
                    values = [columns] + [list(row) for row in rows]
                    
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to fetch transformation data: {str(e)}")
                
        elif source_type == "qualitative":
            # Get data from specific qualitative operation table
            try:
                qual_op = db.query(QualitativeDataOperation).filter(
                    QualitativeDataOperation.id == source_id
                ).first()
                if not qual_op or qual_op.status != 'completed':
                    raise HTTPException(status_code=404, detail="Qualitative operation not completed")
                    
                with engine.connect() as conn:
                    result = conn.execute(text(f"SELECT * FROM {qual_op.output_table_name} LIMIT 1000"))
                    rows = result.fetchall()
                    
                    if not rows:
                        raise HTTPException(status_code=404, detail="No data in qualitative table")
                    
                    columns = list(result.keys())
                    values = [columns] + [list(row) for row in rows]
                    
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to fetch qualitative data: {str(e)}")
                
        elif chart.project_id:
            # Get data from project (transformation or join)
            # For now, try to get data from the most recent executed transformation or join
            # This is a simplified approach - in practice you'd need more specific logic
            try:
                with engine.connect() as conn:
                    # Try to find the most relevant table for this project
                    result = conn.execute(text("""
                        SELECT name FROM sqlite_master 
                        WHERE type='table' 
                        AND (name LIKE 'join_%' OR name LIKE 'transformed_%' OR name LIKE 'step_%')
                        AND name LIKE '%_' || :project_id || '_%'
                        ORDER BY name DESC LIMIT 1
                    """), {"project_id": chart.project_id})
                    
                    row = result.fetchone()
                    if not row:
                        raise HTTPException(status_code=404, detail="No data found for this project")
                    
                    table_name = row[0]
                    result = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 1000"))
                    rows = result.fetchall()
                    
                    if not rows:
                        raise HTTPException(status_code=404, detail="No data in project table")
                    
                    # Convert to list format
                    columns = list(result.keys())
                    values = [columns] + [list(row) for row in rows]
                    
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to fetch project data: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Chart has no valid data source")
        
        # Process data for chart visualization
        if not values or len(values) < 2:
            raise HTTPException(status_code=404, detail="Insufficient data for chart")
        
        headers = values[0]
        data_rows = values[1:]

        chart_type_lower = chart.chart_type.lower()

        if chart_type_lower == 'qualitative_cards':
            unique_column = chart.chart_config.get('unique_column')
            qualitative_column = chart.chart_config.get('qualitative_column')
            quantitative_columns = chart.chart_config.get('quantitative_columns', [])

            raw_records = []
            for row in data_rows:
                if not row:
                    continue
                record = {}
                for idx, header in enumerate(headers):
                    record[header] = row[idx] if idx < len(row) else None
                raw_records.append(record)

            duplicates = find_duplicate_values(raw_records, unique_column) if unique_column else []
            metadata = {
                "unique_column": unique_column,
                "qualitative_column": qualitative_column,
                "quantitative_columns": quantitative_columns,
                "is_unique": len(duplicates) == 0,
                "duplicate_values": duplicates
            }

            return {
                "chart_id": chart.id,
                "chart_name": chart.chart_name,
                "chart_type": chart.chart_type,
                "data": {
                    "raw_data": raw_records,
                    "metadata": metadata
                },
                "options": {},
                "chart_config": chart.chart_config
            }

        # For table charts, we don't need specific column indices
        if chart_type_lower == 'table':
            # Convert data to dict format for easier table rendering
            table_data = []
            for row in data_rows:
                if row:  # Skip empty rows
                    row_dict = {}
                    for i, header in enumerate(headers):
                        row_dict[header] = row[i] if i < len(row) else ''
                    table_data.append(row_dict)
            
            processed_data = process_chart_data(table_data, None, None, chart.chart_type, chart.chart_config)
        else:
            # Find column indices for regular charts
            try:
                x_col_idx = headers.index(chart.x_axis_column) if chart.x_axis_column and chart.x_axis_column.strip() else None
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Column '{chart.x_axis_column}' not found")
            
            y_col_idx = None
            if chart.y_axis_column:
                try:
                    y_col_idx = headers.index(chart.y_axis_column)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Column '{chart.y_axis_column}' not found")
            
            # Process data based on chart type
            processed_data = process_chart_data(data_rows, x_col_idx, y_col_idx, chart.chart_type, chart.chart_config)
        
        return {
            "chart_id": chart.id,
            "chart_name": chart.chart_name,
            "chart_type": chart.chart_type,
            "data": processed_data["data"],
            "options": processed_data["options"],
            "chart_config": chart.chart_config
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Chart data endpoint error for chart_id={chart_id}")
        print(f"DEBUG: Chart type: {chart.chart_type if 'chart' in locals() else 'Unknown'}")
        print(f"DEBUG: Error type: {type(e).__name__}")
        print(f"DEBUG: Error message: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chart data error: {str(e)}")

def process_chart_data(data_rows, x_col_idx, y_col_idx, chart_type, chart_config):
    """Process raw data into Chart.js format"""
    import pandas as pd
    from collections import Counter
    
    # Handle table charts differently
    if chart_type.lower() == 'table':
        # Return raw data for table rendering
        return {
            "data": {
                "raw_data": data_rows,
                "chart_config": chart_config
            },
            "options": {}
        }
    
    # Extract x-axis values
    x_values = [str(row[x_col_idx]) if len(row) > x_col_idx else '' for row in data_rows if row]
    
    if chart_type.lower() == 'pie':
        # For pie charts, count occurrences of each x value
        counts = Counter(x_values)
        labels = list(counts.keys())
        data = list(counts.values())
        
        return {
            "data": {
                "labels": labels,
                "datasets": [{
                    "data": data,
                    "backgroundColor": [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
                        '#9966FF', '#FF9F40', '#C9CBCF', '#4BC0C0'
                    ][:len(data)]
                }]
            },
            "options": {
                "responsive": True,
                "plugins": {
                    "legend": {
                        "position": "top"
                    }
                }
            }
        }
    
    elif y_col_idx is not None:
        # For charts with both X and Y axes
        y_values = []
        labels = []
        
        for row in data_rows:
            if len(row) > max(x_col_idx, y_col_idx):
                try:
                    x_val = str(row[x_col_idx])
                    y_val = float(row[y_col_idx]) if row[y_col_idx] else 0
                    labels.append(x_val)
                    y_values.append(y_val)
                except (ValueError, IndexError):
                    continue
        
        return {
            "data": {
                "labels": labels,
                "datasets": [{
                    "label": chart_config.get("y_axis_label", "Values"),
                    "data": y_values,
                    "backgroundColor": '#36A2EB',
                    "borderColor": '#36A2EB',
                    "borderWidth": 1
                }]
            },
            "options": {
                "responsive": True,
                "scales": {
                    "y": {
                        "beginAtZero": True
                    }
                }
            }
        }
    else:
        # For single-axis charts (like histograms), count occurrences
        counts = Counter(x_values)
        labels = list(counts.keys())
        data = list(counts.values())
        
        return {
            "data": {
                "labels": labels,
                "datasets": [{
                    "label": "Count",
                    "data": data,
                    "backgroundColor": '#36A2EB',
                    "borderColor": '#36A2EB',
                    "borderWidth": 1
                }]
            },
            "options": {
                "responsive": True,
                "scales": {
                    "y": {
                        "beginAtZero": True
                    }
                }
            }
        }

@app.get("/data-sources")
async def get_all_data_sources(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all available data sources (sheets, AI transformations, joins, qualitative) for chart creation"""
    try:
        data_sources = []

        # Get all connected sheets for current user only
        sheet_repo = SheetRepository(db)
        sheets = sheet_repo.get_all_sheets(current_user.id)
        
        for sheet in sheets:
            data_sources.append({
                "id": f"sheet-{sheet.id}",
                "type": "sheet",
                "name": sheet.title,
                "display_name": f"📊 {sheet.title}",
                "columns": sheet.columns or [],
                "metadata": {
                    "total_rows": sheet.total_rows,
                    "sheet_name": sheet.sheet_name
                }
            })
        
        # Get all AI transformation steps for user's projects only
        user_projects = db.query(TransformationProject).filter(
            TransformationProject.user_id == current_user.id
        ).all()
        user_project_ids = [p.id for p in user_projects]

        ai_steps = db.query(AITransformationStep).filter(
            AITransformationStep.project_id.in_(user_project_ids),
            AITransformationStep.status == 'completed'
        ).all()
        
        for step in ai_steps:
            # Get project info for context (already filtered by user)
            project = next((p for p in user_projects if p.id == step.project_id), None)
            
            data_sources.append({
                "id": f"transform-{step.id}",
                "type": "transformation", 
                "name": f"{step.step_name} ({project.name if project else 'Unknown Project'})",
                "display_name": f"🔄 {step.step_name}",
                "columns": step.output_columns or [],
                "metadata": {
                    "project_id": step.project_id,
                    "project_name": project.name if project else "Unknown Project",
                    "output_table_name": step.output_table_name,
                    "execution_order": step.execution_order
                }
            })
        
        # Get all completed joins for user's projects only
        join_repo = JoinRepository(db)
        joins = db.query(JoinOperation).filter(
            JoinOperation.project_id.in_(user_project_ids),
            JoinOperation.status == 'completed'
        ).all()

        for join in joins:
            # Get project info for context (already filtered by user)
            project = next((p for p in user_projects if p.id == join.project_id), None)
            
            # Use actual output columns from the completed join
            actual_columns = join.output_columns or []
            
            data_sources.append({
                "id": f"join-{join.id}",
                "type": "join",
                "name": f"{join.name} ({project.name if project else 'Unknown Project'})",
                "display_name": f"🔗 {join.name}",
                "columns": actual_columns,
                "metadata": {
                    "project_id": join.project_id,
                    "project_name": project.name if project else "Unknown Project",
                    "join_type": join.join_type,
                    "left_table": join.left_table_name if hasattr(join, 'left_table_name') else "Unknown",
                    "right_table": join.right_table_name if hasattr(join, 'right_table_name') else "Unknown",
                    "output_table_name": join.output_table_name
                }
            })
        
        # Get all completed qualitative data operations for user's projects only
        qual_ops = db.query(QualitativeDataOperation).filter(
            QualitativeDataOperation.project_id.in_(user_project_ids),
            QualitativeDataOperation.status == 'completed'
        ).all()

        for qual_op in qual_ops:
            # Get project info for context (already filtered by user)
            project = next((p for p in user_projects if p.id == qual_op.project_id), None)
            
            data_sources.append({
                "id": f"qualitative-{qual_op.id}",
                "type": "qualitative",
                "name": f"{qual_op.name} ({project.name if project else 'Unknown Project'})",
                "display_name": f"🧠 {qual_op.name}",
                "columns": qual_op.output_columns or [],
                "metadata": {
                    "project_id": qual_op.project_id,
                    "project_name": project.name if project else "Unknown Project",
                    "analysis_type": qual_op.analysis_type,
                    "qualitative_column": qual_op.qualitative_column,
                    "output_table_name": qual_op.output_table_name
                }
            })
        
        return {"data_sources": data_sources}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Transformation Project endpoints
@app.get("/projects")
async def get_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all transformation projects"""
    try:
        project_repo = TransformationProjectRepository(db)
        projects = project_repo.get_all_projects(current_user.id)
        
        return {
            "projects": [
                {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "sheet_ids": project.sheet_ids,
                    "pipeline_status": project.pipeline_status,
                    "last_pipeline_run": project.last_pipeline_run.isoformat() if project.last_pipeline_run else None,
                    "schedule_config": project.schedule_config,
                    "warehouse_table_name": project.warehouse_table_name,
                    "created_at": project.created_at.isoformat(),
                    "updated_at": project.updated_at.isoformat()
                }
                for project in projects
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects")
async def create_project(project_request: ProjectCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new transformation project"""
    try:
        # Validate that all sheet IDs exist and belong to current user
        sheet_repo = SheetRepository(db)
        for sheet_id in project_request.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            if not sheet:
                raise HTTPException(status_code=400, detail=f"Sheet with ID {sheet_id} not found or not accessible")

        project_repo = TransformationProjectRepository(db)
        project = project_repo.create_project(
            user_id=current_user.id,
            name=project_request.name,
            description=project_request.description,
            sheet_ids=project_request.sheet_ids
        )
        
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "sheet_ids": project.sheet_ids,
            "created_at": project.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}")
async def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific transformation project"""
    try:
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "sheet_ids": project.sheet_ids,
            "join_config": project.join_config,
            "transformations": project.transformations,
            "pipeline_status": project.pipeline_status,
            "last_pipeline_run": project.last_pipeline_run.isoformat() if project.last_pipeline_run else None,
            "schedule_config": project.schedule_config,
            "warehouse_table_name": project.warehouse_table_name,
            "canvas_layout": project.canvas_layout,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/analyze-join")
async def analyze_join_opportunities(request: JoinAnalysisRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Analyze sheets for potential join opportunities"""
    try:
        
        sheet_repo = SheetRepository(db)
        sheets_data = []
        
        # Get data for all requested sheets
        for sheet_id in request.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            if not sheet:
                raise HTTPException(status_code=400, detail=f"Sheet with ID {sheet_id} not found")
            sheets_data.append({
                "id": sheet.id,
                "title": sheet.title,
                "columns": sheet.columns or [],
                "sample_data": sheet.sample_data or []
            })
        
        # Analyze potential joins
        join_suggestions = []
        if len(sheets_data) >= 2:
            for i in range(len(sheets_data)):
                for j in range(i + 1, len(sheets_data)):
                    sheet1, sheet2 = sheets_data[i], sheets_data[j]
                    
                    # Find potential join columns by comparing column names
                    potential_joins = []
                    for col1 in sheet1["columns"]:
                        for col2 in sheet2["columns"]:
                            # Simple name matching (can be enhanced with fuzzy matching)
                            if col1.lower().strip() == col2.lower().strip():
                                potential_joins.append({
                                    "column1": col1,
                                    "column2": col2,
                                    "confidence": "high",
                                    "reason": "Exact column name match"
                                })
                            elif any(keyword in col1.lower() and keyword in col2.lower() 
                                   for keyword in ['id', 'name', 'email', 'code']):
                                potential_joins.append({
                                    "column1": col1,
                                    "column2": col2,
                                    "confidence": "medium",
                                    "reason": "Similar naming pattern"
                                })
                    
                    if potential_joins:
                        join_suggestions.append({
                            "sheet1_id": sheet1["id"],
                            "sheet1_title": sheet1["title"],
                            "sheet2_id": sheet2["id"],
                            "sheet2_title": sheet2["title"],
                            "suggested_joins": potential_joins[:3]  # Top 3 suggestions
                        })
        
        return {"join_suggestions": join_suggestions}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_warehouse_sheet_data(sheet: ConnectedSheet) -> pd.DataFrame:
    """Get sheet data from warehouse (stored locally) instead of Google Sheets API"""
    try:
        warehouse_table_name = f"sheet_{sheet.id}_{sheet.title.lower().replace(' ', '_').replace('-', '_')}"
        import re
        warehouse_table_name = re.sub(r'[^\w]', '_', warehouse_table_name)
        
        
        # Read from warehouse
        df = pd.read_sql_table(warehouse_table_name, engine)
        return df
        
    except Exception as e:
        # Fallback to Google Sheets if warehouse data doesn't exist
        return fetch_full_sheet_data_from_google(sheet)

def fetch_full_sheet_data_from_google(sheet: ConnectedSheet) -> pd.DataFrame:
    """Fetch complete data from Google Sheets API (fallback only)"""
    try:
        # DEBUG: Check credential structure
        if 'default' not in user_credentials:
            return pd.DataFrame()
        
        
        # Use helper function to get credentials with automatic refresh
        creds = get_refreshed_credentials()
        if creds is None:
            return pd.DataFrame()
        
        service = build('sheets', 'v4', credentials=creds)
        
        # Get actual sheet name first (same logic as analyze_sheet)
        actual_sheet_name = 'Sheet1'  # fallback
        try:
            spreadsheet_metadata = service.spreadsheets().get(spreadsheetId=sheet.spreadsheet_id).execute()
            sheets = spreadsheet_metadata.get('sheets', [])
            if sheets:
                actual_sheet_name = sheets[0]['properties']['title']
        except Exception:
            pass
        
        # Use the same range detection logic as analyze_sheet
        range_attempts = [
            f"{actual_sheet_name}!A:Z",  # Try with actual sheet name first
            f"{sheet.sheet_name}!A:Z",   # Try with stored sheet name (for backward compatibility)
            'A:Z',                       # Without sheet name  
            'A1:Z1000',                  # Specific range
        ]
        
        result = None
        for attempt_range in range_attempts:
            try:
                result = service.spreadsheets().values().get(
                    spreadsheetId=sheet.spreadsheet_id, 
                    range=attempt_range
                ).execute()
                break
            except Exception as range_error:
                continue
        
        if result is None:
            return pd.DataFrame()
        
        values = result.get('values', [])
        if not values or len(values) < 2:
            return pd.DataFrame()
        
        # Convert to DataFrame
        headers = values[0]
        data_rows = values[1:]
        
        # Ensure all rows have same number of columns as headers
        normalized_rows = []
        for row in data_rows:
            # Pad short rows with empty strings
            normalized_row = row + [''] * (len(headers) - len(row))
            # Truncate long rows
            normalized_row = normalized_row[:len(headers)]
            normalized_rows.append(normalized_row)
        
        df = pd.DataFrame(normalized_rows, columns=headers)
        return df
        
    except Exception as e:
        return pd.DataFrame()

# Keep the old function name as an alias for backward compatibility, but it should now use warehouse data
def fetch_full_sheet_data(sheet: ConnectedSheet) -> pd.DataFrame:
    """Fetch sheet data - now reads from warehouse instead of Google Sheets"""
    return get_warehouse_sheet_data(sheet)

@app.post("/projects/{project_id}/preview-join")
async def preview_join(project_id: int, join_config: Dict[str, Any], current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Preview the result of joining sheets with specified configuration"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get sheets data
        sheet_repo = SheetRepository(db)
        dataframes = {}
        sheets_data = {}
        
        for sheet_id in project.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            if sheet:
                df = fetch_full_sheet_data(sheet)
                dataframes[sheet_id] = df
                sheets_data[sheet_id] = {"title": sheet.title}
        
        if len(dataframes) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 sheets to join")
        
        # Perform join based on configuration
        join_type = join_config.get('join_type', 'inner')
        left_sheet_id = join_config.get('left_sheet_id')
        right_sheet_id = join_config.get('right_sheet_id') 
        left_column = join_config.get('left_column')
        right_column = join_config.get('right_column')
        
        if not all([left_sheet_id, right_sheet_id, left_column, right_column]):
            raise HTTPException(status_code=400, detail="Missing join configuration")
        
        left_df = dataframes.get(left_sheet_id)
        right_df = dataframes.get(right_sheet_id)
        
        # Check if we got valid data
        if left_df.empty:
            left_title = sheets_data.get(left_sheet_id, {}).get('title', 'Selected sheet')
            raise HTTPException(status_code=400, detail=f"Could not load data from {left_title}. Please check if the sheet is accessible.")
        
        if right_df.empty:
            right_title = sheets_data.get(right_sheet_id, {}).get('title', 'Selected sheet')
            raise HTTPException(status_code=400, detail=f"Could not load data from {right_title}. Please check if the sheet is accessible.")
        
        # Check if join columns exist
        if left_column not in left_df.columns:
            left_title = sheets_data.get(left_sheet_id, {}).get('title', 'Left sheet')
            raise HTTPException(status_code=400, detail=f"Column '{left_column}' not found in {left_title}")
            
        if right_column not in right_df.columns:
            right_title = sheets_data.get(right_sheet_id, {}).get('title', 'Right sheet')
            raise HTTPException(status_code=400, detail=f"Column '{right_column}' not found in {right_title}")
        
        # Perform the join
        try:
            joined_df = pd.merge(
                left_df, 
                right_df, 
                left_on=left_column, 
                right_on=right_column, 
                how=join_type,
                suffixes=('_left', '_right')
            )
            
            # Check if join produced any results
            if joined_df.empty:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Join produced no results. The values in '{left_column}' and '{right_column}' don't match. Try a different join type or check your data."
                )
            
            # Return preview (first 10 rows)
            preview_data = joined_df.head(10).fillna('').values.tolist()
            columns = joined_df.columns.tolist()
            
            return {
                "preview_data": preview_data,
                "columns": columns,
                "total_rows": len(joined_df),
                "join_stats": {
                    "left_rows": len(left_df),
                    "right_rows": len(right_df),
                    "joined_rows": len(joined_df),
                    "join_type": join_type
                }
            }
            
        except HTTPException:
            raise
        except Exception as join_error:
            error_msg = str(join_error)
            if "merge keys" in error_msg.lower():
                raise HTTPException(status_code=400, detail=f"Column data types don't match for joining. Make sure '{left_column}' and '{right_column}' contain similar data types.")
            else:
                raise HTTPException(status_code=400, detail=f"Join failed: {error_msg}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Join Operation endpoints
@app.post("/projects/{project_id}/joins")
async def create_join(project_id: int, request: JoinCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new join operation"""
    try:
        # Verify project exists
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Validate table types and IDs
        sheet_repo = SheetRepository(db)
        
        # Validate left table
        left_df = load_table_data(request.left_table_id, request.left_table_type, current_user, db)
        if left_df is None or left_df.empty:
            raise HTTPException(status_code=404, detail=f"Left table ({request.left_table_type}) not found or has no data")
        
        # Validate right table  
        right_df = load_table_data(request.right_table_id, request.right_table_type, current_user, db)
        if right_df is None or right_df.empty:
            raise HTTPException(status_code=404, detail=f"Right table ({request.right_table_type}) not found or has no data")
        
        # Create join operation
        join_repo = JoinRepository(db)
        join_keys = [{"left": key.left, "right": key.right} for key in request.join_keys]
        
        join_op = join_repo.create_join(
            project_id=project_id,
            name=request.name,
            left_table_id=request.left_table_id,
            right_table_id=request.right_table_id,
            left_table_type=request.left_table_type,
            right_table_type=request.right_table_type,
            join_type=request.join_type,
            join_keys=join_keys,
            canvas_position=request.canvas_position,
            output_table_name=request.output_table_name
        )
        
        return {
            "join_id": join_op.id,
            "status": "created",
            "message": "Join operation created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/projects/{project_id}/joins/{join_id}")
async def update_join(project_id: int, join_id: int, request: JoinCreateRequest, db: Session = Depends(get_db)):
    """Update an existing join operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get existing join
        join_repo = JoinRepository(db)
        existing_join = join_repo.get_join_by_id(join_id)
        if not existing_join or existing_join.project_id != project_id:
            raise HTTPException(status_code=404, detail="Join not found")
        
        # Update join fields
        join_keys = [{"left": key.left, "right": key.right} for key in request.join_keys]
        
        # Update the join in database
        updated_join = join_repo.update_join(
            join_id=join_id,
            name=request.name,
            output_table_name=request.output_table_name,
            left_table_id=request.left_table_id,
            right_table_id=request.right_table_id,
            left_table_type=request.left_table_type,
            right_table_type=request.right_table_type,
            join_type=request.join_type,
            join_keys=join_keys
        )
        
        return {
            "join_id": updated_join.id,
            "status": "updated", 
            "message": "Join operation updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/joins")
async def get_project_joins(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all join operations for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Verify project exists
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        join_repo = JoinRepository(db)
        joins = join_repo.get_joins_by_project(project_id)
        
        return {
            "joins": [
                {
                    "id": join.id,
                    "name": join.name,
                    "left_table_id": join.left_table_id,
                    "right_table_id": join.right_table_id,
                    "left_table_type": join.left_table_type,
                    "right_table_type": join.right_table_type,
                    "join_type": join.join_type,
                    "join_keys": join.join_keys,
                    "status": join.status,
                    "error_message": join.error_message,
                    "output_table_name": join.output_table_name,
                    "output_columns": join.output_columns,
                    "canvas_position": join.canvas_position,
                    "execution_time_ms": join.execution_time_ms,
                    "created_at": join.created_at.isoformat(),
                    "updated_at": join.updated_at.isoformat()
                }
                for join in joins
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/{project_id}/joins/{join_id}/execute")
async def execute_join(project_id: int, join_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Execute a join operation"""
    try:
        
        import time
        start_time = time.time()
        
        join_repo = JoinRepository(db)
        join_op = join_repo.get_join_by_id(join_id)
        
        if not join_op or join_op.project_id != project_id:
            raise HTTPException(status_code=404, detail="Join operation not found")
        
        # Get data from both tables and perform join - wrap everything in try-catch
        try:
            left_df = None
            right_df = None
            
            sheet_repo = SheetRepository(db)
            
            # Get left table data using unified helper
            left_df = load_table_data(join_op.left_table_id, join_op.left_table_type, current_user, db)
            if left_df is None or left_df.empty:
                raise Exception(f"Could not load left table ({join_op.left_table_type}). Please ensure it exists and has data.")
            
            # Get right table data using unified helper
            right_df = load_table_data(join_op.right_table_id, join_op.right_table_type, current_user, db)
            if right_df is None or right_df.empty:
                raise Exception(f"Could not load right table ({join_op.right_table_type}). Please ensure it exists and has data.")
            
            if left_df is None or right_df is None:
                raise Exception("Failed to load data for join")
            
            # Perform the join
            join_keys = join_op.join_keys
            left_on = [key['left'] for key in join_keys]
            right_on = [key['right'] for key in join_keys]
            
            # Validate that all join columns exist in the dataframes
            for key in join_keys:
                left_col = key['left']
                right_col = key['right']
                
                if left_col not in left_df.columns:
                    available_left = ', '.join(left_df.columns.tolist())
                    raise Exception(f"Column '{left_col}' not found in left table. Available columns: {available_left}")
                
                if right_col not in right_df.columns:
                    available_right = ', '.join(right_df.columns.tolist())
                    raise Exception(f"Column '{right_col}' not found in right table. Available columns: {available_right}")
            
            # Map join types
            how_mapping = {
                'inner': 'inner',
                'left': 'left',
                'right': 'right',
                'full': 'outer'
            }
            
            result_df = pd.merge(
                left_df, 
                right_df, 
                left_on=left_on, 
                right_on=right_on, 
                how=how_mapping.get(join_op.join_type, 'inner'),
                suffixes=('_left', '_right')
            )
            
            # Save result to database
            result_df.to_sql(join_op.output_table_name, engine, if_exists='replace', index=False)
            
            # Update join operation status
            execution_time = int((time.time() - start_time) * 1000)
            join_repo.update_join_status(
                join_id=join_id,
                status='completed',
                output_columns=result_df.columns.tolist(),
                execution_time_ms=execution_time
            )
            
            return {
                "status": "completed",
                "message": "Join executed successfully",
                "output_table_name": join_op.output_table_name,
                "output_columns": result_df.columns.tolist(),
                "row_count": len(result_df),
                "execution_time_ms": execution_time
            }
            
        except Exception as execution_error:
            # Update join operation with error (catches all errors including data fetch and join execution)
            join_repo.update_join_status(
                join_id=join_id,
                status='failed',
                error_message=str(execution_error)
            )
            raise HTTPException(status_code=400, detail=f"Join execution failed: {str(execution_error)}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/joins/{join_id}/data")
async def get_join_data(project_id: int, join_id: int, db: Session = Depends(get_db)):
    """Get data from a completed join operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        join_repo = JoinRepository(db)
        join_op = join_repo.get_join_by_id(join_id)
        
        if not join_op or join_op.project_id != project_id:
            raise HTTPException(status_code=404, detail="Join not found")
        
        if join_op.status != 'completed':
            raise HTTPException(status_code=400, detail="Join has not been executed successfully")
        
        # Get data from the join result table
        try:
            with engine.connect() as conn:
                table_name = join_op.output_table_name
                if not table_name:
                    raise HTTPException(status_code=404, detail="Join output table not found")
                
                # Check if table exists
                result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name = :name"), 
                                    {"name": table_name})
                if not result.fetchone():
                    raise HTTPException(status_code=404, detail="Join output table does not exist")
                
                # Get table data
                df = pd.read_sql_table(table_name, conn)
                
                # Convert to frontend format
                columns = df.columns.tolist()
                data_rows = []
                
                for _, row in df.iterrows():
                    row_data = []
                    for value in row:
                        if pd.isna(value):
                            row_data.append(None)
                        elif isinstance(value, (int, float)):
                            row_data.append(value)
                        else:
                            row_data.append(str(value))
                    data_rows.append(row_data)
                
                return {
                    "columns": columns,
                    "data": data_rows,
                    "total_rows": len(data_rows),
                    "table_name": table_name
                }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading join data: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/projects/{project_id}/joins/{join_id}")
async def delete_join(project_id: int, join_id: int, db: Session = Depends(get_db)):
    """Delete a join operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        join_repo = JoinRepository(db)
        join_op = join_repo.get_join_by_id(join_id)
        
        if not join_op or join_op.project_id != project_id:
            raise HTTPException(status_code=404, detail="Join operation not found")
        
        # Delete output table if it exists
        if join_op.output_table_name:
            try:
                with engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {join_op.output_table_name}"))
                    conn.commit()
            except Exception:
                pass  # Ignore errors dropping table
        
        # Delete join operation
        success = join_repo.delete_join(join_id)
        if success:
            return {"status": "deleted", "message": "Join operation deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Join operation not found")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Qualitative Data Endpoints
@app.post("/projects/{project_id}/qualitative-data")
async def create_qualitative_data_operation(
    project_id: int, 
    request: QualitativeDataCreateRequest, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Create a new qualitative data analysis operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Verify project exists
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Validate source table using unified helper
        available_columns = get_table_columns(request.source_table_id, request.source_table_type, current_user, db)
        
        if not available_columns:
            raise HTTPException(
                status_code=404, 
                detail=f"Source table ({request.source_table_type}) not found or has no available columns"
            )
        
        # Validate qualitative column exists
        if request.qualitative_column not in available_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Column '{request.qualitative_column}' not found. Available columns: {available_columns}"
            )
        
        # Additional validation for aggregation column if provided
        if request.aggregation_column and request.aggregation_column not in available_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Aggregation column '{request.aggregation_column}' not found. Available columns: {available_columns}"
            )
        
        # Additional validation for sentiment column if provided
        if request.sentiment_column and request.sentiment_column not in available_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Sentiment column '{request.sentiment_column}' not found. Available columns: {available_columns}"
            )
        
        # Validate analysis type
        if request.analysis_type not in ['sentiment', 'summarization']:
            raise HTTPException(status_code=400, detail="Invalid analysis_type. Must be 'sentiment' or 'summarization'")
        
        # Debug aggregation column
        print(f"🚀 CREATE DEBUG: aggregation_column = {repr(request.aggregation_column)}")
        print(f"🚀 CREATE DEBUG: type = {type(request.aggregation_column)}")
        print(f"🚀 CREATE DEBUG: full request = {request}")
        
        # Clean up aggregation_column for database storage
        clean_aggregation_column = request.aggregation_column
        if clean_aggregation_column == "":
            clean_aggregation_column = None
        print(f"🚀 CREATE DEBUG: cleaned aggregation_column = {repr(clean_aggregation_column)}")
        
        # Create qualitative data operation
        qualitative_repo = QualitativeDataRepository(db)
        
        qualitative_op = qualitative_repo.create_qualitative_operation(
            project_id=project_id,
            name=request.name,
            source_table_id=request.source_table_id,
            source_table_type=request.source_table_type,
            qualitative_column=request.qualitative_column,
            analysis_type=request.analysis_type,
            aggregation_column=clean_aggregation_column,
            summarize_sentiment_analysis=request.summarize_sentiment_analysis,
            sentiment_column=request.sentiment_column,
            canvas_position=request.canvas_position,
            output_table_name=request.output_table_name
        )
        
        return {
            "operation_id": qualitative_op.id,
            "status": "created",
            "message": "Qualitative data analysis operation created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/qualitative-data")
async def get_project_qualitative_operations(
    project_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Get all qualitative data operations for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Verify project exists
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        qualitative_repo = QualitativeDataRepository(db)
        operations = qualitative_repo.get_qualitative_operations_by_project(project_id)
        
        return {
            "operations": [{
                "id": op.id,
                "name": op.name,
                "source_table_id": op.source_table_id,
                "source_table_type": op.source_table_type,
                "qualitative_column": op.qualitative_column,
                "analysis_type": op.analysis_type,
                "aggregation_column": op.aggregation_column,
                "status": op.status,
                "error_message": op.error_message,
                "output_table_name": op.output_table_name,
                "canvas_position": op.canvas_position,
                "total_records_processed": op.total_records_processed,
                "batch_count": op.batch_count,
                "execution_time_ms": op.execution_time_ms,
                "created_at": op.created_at.isoformat() if op.created_at else None,
                "updated_at": op.updated_at.isoformat() if op.updated_at else None
            } for op in operations]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/projects/{project_id}/qualitative-data/{operation_id}")
async def update_qualitative_data_operation(
    project_id: int, 
    operation_id: int, 
    request: QualitativeDataUpdateRequest, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Update a qualitative data operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        qualitative_repo = QualitativeDataRepository(db)
        
        # Get existing operation
        operation = qualitative_repo.get_qualitative_operation_by_id(operation_id)
        if not operation or operation.project_id != project_id:
            raise HTTPException(status_code=404, detail="Qualitative data operation not found")
        
        # Prepare updated values (only update provided fields)
        name = request.name if request.name is not None else operation.name
        source_table_id = request.source_table_id if request.source_table_id is not None else operation.source_table_id
        source_table_type = request.source_table_type if request.source_table_type is not None else operation.source_table_type
        qualitative_column = request.qualitative_column if request.qualitative_column is not None else operation.qualitative_column
        analysis_type = request.analysis_type if request.analysis_type is not None else operation.analysis_type
        aggregation_column = request.aggregation_column if request.aggregation_column is not None else getattr(operation, 'aggregation_column', None)
        summarize_sentiment_analysis = request.summarize_sentiment_analysis if request.summarize_sentiment_analysis is not None else getattr(operation, 'summarize_sentiment_analysis', False)
        sentiment_column = request.sentiment_column if request.sentiment_column is not None else getattr(operation, 'sentiment_column', None)
        output_table_name = request.output_table_name if request.output_table_name is not None else operation.output_table_name
        
        # Validate analysis type if provided
        if request.analysis_type and request.analysis_type not in ['sentiment', 'summarization']:
            raise HTTPException(status_code=400, detail="Invalid analysis_type. Must be 'sentiment' or 'summarization'")
        
        # Update the operation
        updated_operation = qualitative_repo.update_qualitative_operation(
            operation_id=operation_id,
            name=name,
            source_table_id=source_table_id,
            source_table_type=source_table_type,
            qualitative_column=qualitative_column,
            analysis_type=analysis_type,
            aggregation_column=aggregation_column,
            summarize_sentiment_analysis=summarize_sentiment_analysis,
            sentiment_column=sentiment_column,
            output_table_name=output_table_name
        )
        
        if updated_operation:
            return {
                "status": "updated",
                "message": "Qualitative data operation updated successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Qualitative data operation not found")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/{project_id}/qualitative-data/{operation_id}/execute")
async def execute_qualitative_data_operation(
    project_id: int, 
    operation_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Execute a qualitative data analysis operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        qualitative_repo = QualitativeDataRepository(db)
        
        # Get operation
        operation = qualitative_repo.get_qualitative_operation_by_id(operation_id)
        if not operation or operation.project_id != project_id:
            raise HTTPException(status_code=404, detail="Qualitative data operation not found")
        
        # Update status to running
        qualitative_repo.update_qualitative_status(
            operation_id=operation_id,
            status='running'
        )
        
        import time
        start_time = time.time()
        
        try:
            # Get source data using unified helper
            source_df = load_table_data(operation.source_table_id, operation.source_table_type, current_user, db)
            
            if source_df is None or source_df.empty:
                raise Exception("No data available for analysis")
            
            print(f"DEBUG: Source data shape: {source_df.shape}")
            print(f"DEBUG: Source data columns: {source_df.columns.tolist()}")
            
            # Validate column exists
            if operation.qualitative_column not in source_df.columns:
                available_cols = list(source_df.columns)
                raise Exception(f"Column '{operation.qualitative_column}' not found. Available: {available_cols}")
            
            print(f"DEBUG: Qualitative column '{operation.qualitative_column}' sample values:\n{source_df[operation.qualitative_column].head()}")
            print(f"DEBUG: Non-null values in qualitative column: {source_df[operation.qualitative_column].notna().sum()}")
            print(f"⚡ EXECUTE DEBUG: Aggregation column for analysis: {repr(operation.aggregation_column)}")
            print(f"⚡ EXECUTE DEBUG: type = {type(operation.aggregation_column)}")
            
            # Perform analysis using the service
            service = get_qualitative_service()
            analysis_result = await service.analyze_qualitative_data(
                df=source_df,
                text_column=operation.qualitative_column,
                analysis_type=operation.analysis_type,
                aggregation_column=operation.aggregation_column,
                summarize_sentiment_analysis=getattr(operation, 'summarize_sentiment_analysis', False),
                sentiment_column=getattr(operation, 'sentiment_column', None)
            )
            
            if not analysis_result.get('success'):
                raise Exception(analysis_result.get('error', 'Analysis failed'))
            
            # Save result to database
            result_df = analysis_result['output_data']
            
            print(f"DEBUG: Analysis result shape: {result_df.shape}")
            print(f"DEBUG: Analysis result columns: {result_df.columns.tolist()}")
            print(f"DEBUG: First few result rows:\n{result_df.head()}")
            
            # Generate output table name using same logic as AI transformations
            if operation.output_table_name:
                # Use custom table name if provided
                import re
                output_table_name = re.sub(r'[^\w]', '_', operation.output_table_name.lower())
            else:
                # Use default pattern
                output_table_name = f"qualitative_{operation.analysis_type}_{operation.id}_{int(time.time())}"
            
            print(f"DEBUG: Saving result to table: {output_table_name}")
            
            # Store result in database
            result_df.to_sql(output_table_name, engine, if_exists='replace', index=False)
            
            print(f"DEBUG: Successfully saved {len(result_df)} rows to database")
            
            # Calculate execution time
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            # Update operation status
            # Try to use new field, fall back to old field for compatibility
            try:
                qualitative_repo.update_qualitative_status(
                    operation_id=operation_id,
                    status='completed',
                    actual_table_name=output_table_name,
                    output_columns=list(result_df.columns),
                    execution_time_ms=execution_time_ms,
                    total_records=analysis_result.get('total_records', len(source_df)),
                    batch_count=analysis_result.get('batch_count', 1)
                )
            except Exception as e:
                print(f"DEBUG: New field update failed, using old method: {e}")
                # Fallback to old method without actual_table_name
                qualitative_repo.update_qualitative_status(
                    operation_id=operation_id,
                    status='completed',
                    output_columns=list(result_df.columns),
                    execution_time_ms=execution_time_ms,
                    total_records=analysis_result.get('total_records', len(source_df)),
                    batch_count=analysis_result.get('batch_count', 1)
                )
            
            return {
                "status": "completed",
                "message": "Qualitative data analysis completed successfully",
                "output_table_name": output_table_name,
                "total_records_processed": analysis_result.get('total_records', len(source_df)),
                "analysis_type": operation.analysis_type,
                "execution_time_ms": execution_time_ms,
                "batch_count": analysis_result.get('batch_count', 1)
            }
            
        except Exception as e:
            # Update status to failed
            qualitative_repo.update_qualitative_status(
                operation_id=operation_id,
                status='failed',
                error_message=str(e)
            )
            raise Exception(f"Analysis failed: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/qualitative-data/{operation_id}/data")
async def get_qualitative_data_results(
    project_id: int, 
    operation_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Get results from a qualitative data analysis operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        qualitative_repo = QualitativeDataRepository(db)
        
        # Get operation
        operation = qualitative_repo.get_qualitative_operation_by_id(operation_id)
        if not operation or operation.project_id != project_id:
            raise HTTPException(status_code=404, detail="Qualitative data operation not found")
        
        if operation.status != 'completed':
            raise HTTPException(status_code=400, detail="Operation not completed yet")
        
        # Use actual_table_name if available, otherwise fall back to output_table_name
        table_name = getattr(operation, 'actual_table_name', None) or operation.output_table_name
        if not table_name:
            raise HTTPException(status_code=404, detail="No output data available")
        
        # Load data from warehouse
        try:
            df = pd.read_sql_table(table_name, engine)
            
            print(f"DEBUG: Loaded qualitative data table '{table_name}'")
            print(f"DEBUG: DataFrame shape: {df.shape}")
            print(f"DEBUG: DataFrame columns: {df.columns.tolist()}")
            print(f"DEBUG: First few rows:\n{df.head()}")
            
            # Convert DataFrame to the format expected by DataViewer (same as AI transformations)
            columns = df.columns.tolist()
            data_rows = []
            
            # Convert DataFrame rows to list of lists, handling various data types
            for _, row in df.iterrows():
                row_data = []
                for value in row:
                    if pd.isna(value):
                        row_data.append(None)
                    elif isinstance(value, (int, float)):
                        row_data.append(value)
                    else:
                        row_data.append(str(value))
                data_rows.append(row_data)
            
            print(f"DEBUG: Converted to {len(data_rows)} data rows")
            if data_rows:
                print(f"DEBUG: First row: {data_rows[0]}")
            
            return {
                "columns": columns,
                "data": data_rows,
                "total_rows": len(data_rows),
                "table_name": operation.output_table_name or getattr(operation, 'actual_table_name', None) or table_name,
                "analysis_type": operation.analysis_type,
                "operation_name": operation.name
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load results: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/projects/{project_id}/qualitative-data/{operation_id}")
async def delete_qualitative_data_operation(
    project_id: int, 
    operation_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Delete a qualitative data operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        qualitative_repo = QualitativeDataRepository(db)
        operation = qualitative_repo.get_qualitative_operation_by_id(operation_id)
        
        if not operation or operation.project_id != project_id:
            raise HTTPException(status_code=404, detail="Qualitative data operation not found")
        
        # Delete output table if it exists
        if operation.output_table_name:
            try:
                with engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {operation.output_table_name}"))
                    conn.commit()
            except Exception:
                pass  # Ignore errors dropping table
        
        # Delete operation
        success = qualitative_repo.delete_qualitative_operation(operation_id)
        if success:
            return {"status": "deleted", "message": "Qualitative data operation deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Qualitative data operation not found")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Project Charts endpoints
@app.get("/projects/{project_id}/charts")
async def get_project_charts(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get charts for a transformation project"""
    try:
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get charts associated with this project (already verified user owns project)
        chart_repo = ChartRepository(db)
        charts = db.query(SavedChart).filter(
            SavedChart.user_id == current_user.id,
            SavedChart.project_id == project_id
        ).all()
        
        return {
            "charts": [
                {
                    "id": chart.id,
                    "chart_name": chart.chart_name,
                    "chart_type": chart.chart_type,
                    "x_axis_column": chart.x_axis_column,
                    "y_axis_column": chart.y_axis_column,
                    "chart_config": chart.chart_config,
                    "created_at": chart.created_at.isoformat(),
                    "updated_at": chart.updated_at.isoformat()
                }
                for chart in charts
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/recommendations")
async def get_project_chart_recommendations(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get chart recommendations for a transformation project based on joined data"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get the columns from the joined data by simulating a join
        # For now, we'll get columns from all sheets and provide basic recommendations
        sheet_repo = SheetRepository(db)
        all_columns = set()
        
        for sheet_id in project.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            if sheet and sheet.columns:
                all_columns.update(sheet.columns)
        
        column_list = list(all_columns)
        
        # Generate basic recommendations based on available columns
        recommendations = []
        
        # Look for common analysis patterns
        numeric_columns = []
        categorical_columns = []
        date_columns = []
        
        for col in column_list:
            col_lower = col.lower()
            if any(word in col_lower for word in ['amount', 'count', 'total', 'sum', 'value', 'price', 'cost', 'revenue', 'age', 'score', 'rating', 'number', 'qty', 'quantity']):
                numeric_columns.append(col)
            elif any(word in col_lower for word in ['date', 'time', 'created', 'updated', 'timestamp']):
                date_columns.append(col)
            else:
                categorical_columns.append(col)
        
        # Generate recommendations for joined data
        if categorical_columns:
            main_cat = categorical_columns[0]
            recommendations.append({
                "type": "pie",
                "title": f"Distribution of {main_cat} (Combined Data)",
                "description": f"See the breakdown of {main_cat.lower()} values across all joined sheets",
                "x_axis": main_cat,
                "y_axis": None,
                "reason": f"Understand the combined distribution of {main_cat.lower()} from your transformation"
            })
        
        if numeric_columns and categorical_columns:
            num_col = numeric_columns[0]
            cat_col = categorical_columns[0]
            recommendations.append({
                "type": "bar",
                "title": f"{num_col} by {cat_col} (Transformed)",
                "description": f"Compare {num_col.lower()} across different {cat_col.lower()} from your joined data",
                "x_axis": cat_col,
                "y_axis": num_col,
                "reason": f"Analyze how {num_col.lower()} varies by {cat_col.lower()} in your combined dataset"
            })
        
        if len(numeric_columns) >= 2:
            recommendations.append({
                "type": "scatter",
                "title": f"{numeric_columns[0]} vs {numeric_columns[1]} (Combined)",
                "description": f"Relationship between {numeric_columns[0]} and {numeric_columns[1]} in joined data",
                "x_axis": numeric_columns[0],
                "y_axis": numeric_columns[1],
                "reason": "Discover correlations that emerge from your data transformation"
            })
        
        return {"recommendations": recommendations}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ProjectChartCreateRequest(BaseModel):
    chart_name: str
    chart_type: str
    x_axis_column: str
    y_axis_column: Optional[str] = None
    aggregation: Optional[str] = None
    chart_config: Dict[str, Any] = {}

class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sheet_ids: Optional[List[int]] = None
    join_config: Optional[Dict[str, Any]] = None
    transformations: Optional[List[Dict[str, Any]]] = None
    schedule_config: Optional[Dict[str, Any]] = None

@app.put("/projects/{project_id}")
async def update_project(project_id: int, update_request: ProjectUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update only the fields that were provided
        update_data = {k: v for k, v in update_request.model_dump().items() if v is not None}
        updated_project = project_repo.update_project(project_id, **update_data)
        
        # If join_config or transformations changed, trigger pipeline execution
        if 'join_config' in update_data or 'transformations' in update_data:
            import asyncio
            asyncio.create_task(execute_transformation_pipeline(project_id, current_user.id, db))
        
        return {
            "id": updated_project.id,
            "name": updated_project.name,
            "description": updated_project.description,
            "sheet_ids": updated_project.sheet_ids,
            "join_config": updated_project.join_config,
            "transformations": updated_project.transformations,
            "pipeline_status": updated_project.pipeline_status,
            "last_pipeline_run": updated_project.last_pipeline_run.isoformat() if updated_project.last_pipeline_run else None,
            "schedule_config": updated_project.schedule_config,
            "warehouse_table_name": updated_project.warehouse_table_name,
            "created_at": updated_project.created_at.isoformat(),
            "updated_at": updated_project.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/projects/{project_id}/canvas-layout")
async def update_project_canvas_layout(
    project_id: int,
    request: CanvasLayoutUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update the canvas layout (node positions and connections) for a project"""
    try:
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update the canvas layout
        layout_data = {
            "nodes": request.nodes,
            "connections": request.connections
        }

        project_repo.update_project(current_user.id, project_id, canvas_layout=layout_data)
        
        return {"message": "Canvas layout updated successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating canvas layout: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update canvas layout: {str(e)}")

@app.delete("/projects/{project_id}")
async def delete_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a transformation project and all associated data"""
    try:
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Delete AI transformation steps and their output tables
        ai_steps = db.query(AITransformationStep).filter(
            AITransformationStep.project_id == project_id
        ).all()
        for step in ai_steps:
            # Delete output table if it exists
            if step.output_table_name:
                try:
                    with engine.connect() as conn:
                        conn.execute(text(f"DROP TABLE IF EXISTS {step.output_table_name}"))
                        conn.commit()
                except Exception as e:
                    print(f"Warning: Failed to drop transformation table {step.output_table_name}: {e}")
            else:
                # Try to drop default table name pattern
                try:
                    step_name_clean = step.step_name.lower().replace(' ', '_').replace('-', '_')
                    table_name = f"transform_step_{step.id}_{step_name_clean}"
                    import re
                    table_name = re.sub(r'[^\w]', '_', table_name)
                    with engine.connect() as conn:
                        conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                        conn.commit()
                except Exception as e:
                    print(f"Warning: Failed to drop default transformation table for step {step.id}: {e}")
            
            db.delete(step)
        
        # Delete join operations and their output tables
        join_repo = JoinRepository(db)
        joins = join_repo.get_joins_by_project(project_id)
        for join in joins:
            # Delete output table if it exists
            if join.output_table_name:
                try:
                    with engine.connect() as conn:
                        conn.execute(text(f"DROP TABLE IF EXISTS {join.output_table_name}"))
                        conn.commit()
                except Exception as e:
                    print(f"Warning: Failed to drop join table {join.output_table_name}: {e}")
            
            join_repo.delete_join(join.id)
        
        # Delete qualitative data operations and their output tables
        qualitative_repo = QualitativeDataRepository(db)
        qualitative_operations = qualitative_repo.get_qualitative_operations_by_project(project_id)
        for operation in qualitative_operations:
            # Delete output table if it exists
            if operation.output_table_name:
                try:
                    with engine.connect() as conn:
                        conn.execute(text(f"DROP TABLE IF EXISTS {operation.output_table_name}"))
                        conn.commit()
                except Exception as e:
                    print(f"Warning: Failed to drop qualitative table {operation.output_table_name}: {e}")
            
            qualitative_repo.delete_qualitative_operation(operation.id)
        
        # Delete canvas layout data (nodes and connections)
        canvas_nodes = db.query(CanvasNode).filter(CanvasNode.project_id == project_id).all()
        for node in canvas_nodes:
            db.delete(node)
        
        canvas_connections = db.query(CanvasConnection).filter(CanvasConnection.project_id == project_id).all()
        for connection in canvas_connections:
            db.delete(connection)
        
        # Commit all deletions so far
        db.commit()

        # Delete project charts (cascade handled by database relationship)
        chart_repo = ChartRepository(db)
        project_charts = db.query(SavedChart).filter(
            SavedChart.user_id == current_user.id,
            SavedChart.project_id == project_id
        ).all()
        for chart in project_charts:
            chart_repo.delete_chart(current_user.id, chart.id)
        
        # Delete warehouse data if exists
        if project.warehouse_table_name:
            try:
                warehouse_repo = db.query(TransformedDataWarehouse).filter(
                    TransformedDataWarehouse.project_id == project_id
                ).first()
                if warehouse_repo:
                    db.delete(warehouse_repo)
            except Exception as e:
                print(f"Warning: Failed to clean up warehouse entry: {e}")
        
        # Delete the project itself
        success = project_repo.delete_project(current_user.id, project_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete project")
        
        return {"message": "Project and all associated data deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Pipeline orchestration functions
async def execute_transformation_pipeline(project_id: int, user_id: int, db: Session):
    """Execute the transformation pipeline for a project"""
    from datetime import datetime, timezone
    
    start_time = datetime.now(timezone.utc)
    history_entry = None

    try:
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(user_id, project_id)
        
        if not project:
            return
        
        # Create history entry
        history_entry = PipelineExecutionHistory(
            project_id=project_id,
            status='running',
            started_at=start_time,
            total_sheets=len(project.sheet_ids)
        )
        db.add(history_entry)
        db.commit()
        db.refresh(history_entry)
        
        # Update pipeline status to running
        project_repo.update_project(project_id, pipeline_status='running')
        
        # Step 1: Sync all source sheets first
        sheet_repo = SheetRepository(db)
        sync_result = await sync_project_source_sheets(project, sheet_repo)
        
        # Update history with sync results
        history_entry.sheets_synced = sync_result.get('synced_count', 0)
        db.commit()
        
        if not sync_result.get('success', False):
            # Update history entry with failure
            history_entry.status = 'failed'
            history_entry.completed_at = datetime.now(timezone.utc)
            history_entry.duration_seconds = int((history_entry.completed_at - start_time).total_seconds())
            history_entry.error_message = 'Failed to sync source sheets'
            db.commit()
            
            project_repo.update_project(project_id, pipeline_status='failed')
            return
        
        # Step 2: Get fresh sheets data and apply transformations
        transformed_data = await process_transformation(project, user_id, sheet_repo)
        
        if transformed_data is not None:
            # Step 3: Store in warehouse
            warehouse_table_name = f"transformed_project_{project_id}"
            store_in_warehouse(transformed_data, warehouse_table_name, project_id, db)
            
            # Update history entry with success
            end_time = datetime.now(timezone.utc)
            history_entry.status = 'completed'
            history_entry.completed_at = end_time
            history_entry.duration_seconds = int((end_time - start_time).total_seconds())
            history_entry.rows_processed = len(transformed_data)
            db.commit()
            
            # Update project with warehouse table name and completion status
            project_repo.update_project(
                project_id, 
                warehouse_table_name=warehouse_table_name,
                pipeline_status='completed',
                last_pipeline_run=start_time
            )
        else:
            # Update history entry with failure
            end_time = datetime.now(timezone.utc)
            history_entry.status = 'failed'
            history_entry.completed_at = end_time
            history_entry.duration_seconds = int((end_time - start_time).total_seconds())
            history_entry.error_message = 'Transformation processing failed'
            db.commit()
            
            project_repo.update_project(project_id, pipeline_status='failed')
            
    except Exception as e:
        # Update pipeline status to failed
        project_repo = TransformationProjectRepository(db)
        project_repo.update_project(project_id, pipeline_status='failed')
        
        # Update history entry with exception details
        if history_entry:
            end_time = datetime.now(timezone.utc)
            history_entry.status = 'failed'
            history_entry.completed_at = end_time
            history_entry.duration_seconds = int((end_time - start_time).total_seconds())
            history_entry.error_message = str(e)[:500]  # Limit error message length
            db.commit()
        
        print(f"Pipeline execution failed for project {project_id}: {e}")

async def sync_project_source_sheets(project: TransformationProject, sheet_repo: SheetRepository):
    """Sync all source sheets for a transformation project"""
    try:
        # Check authentication
        if 'default' not in user_credentials:
            print(f"Not authenticated with Google for project {project.id}")
            return False
        
        # Build the service with stored credentials
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        
        creds = get_refreshed_credentials()
        if creds is None:
            print(f"ERROR: Could not get valid credentials for syncing sheets")
            return False
        service = build('sheets', 'v4', credentials=creds)
        
        synced_count = 0
        total_sheets = len(project.sheet_ids)
        
        for sheet_id in project.sheet_ids:
            try:
                existing_sheet = sheet_repo.get_sheet_by_id(sheet_id, user_id)
                
                if not existing_sheet:
                    print(f"Sheet {sheet_id} not found for project {project.id}")
                    continue
                
                # Get fresh data from Google Sheets using the same logic as resync
                sheet = service.spreadsheets()
                
                range_attempts = [
                    f"{existing_sheet.sheet_name}!A:Z",  # Try with known sheet name
                    'A:Z',       # Without sheet name
                    'A1:Z1000',  # Specific range
                ]
                
                result = None
                successful_range = None
                
                for attempt_range in range_attempts:
                    try:
                        result = sheet.values().get(spreadsheetId=existing_sheet.spreadsheet_id, range=attempt_range).execute()
                        successful_range = attempt_range
                        break
                    except Exception as range_error:
                        continue
                
                if result is None:
                    print(f"Unable to sync sheet {sheet_id} for project {project.id}")
                    continue
                
                values = result.get('values', [])
                
                if not values:
                    print(f"No data found in sheet {sheet_id} for project {project.id}")
                    continue
                
                # Update the existing sheet with fresh data
                columns = values[0] if values else []
                sample_data = values[:10]  # Store first 10 rows
                
                updated_sheet = sheet_repo.create_or_update_sheet(
                    spreadsheet_id=existing_sheet.spreadsheet_id,
                    spreadsheet_url=existing_sheet.spreadsheet_url,
                    title=existing_sheet.title,
                    sheet_name=existing_sheet.sheet_name,
                    columns=columns,
                    sample_data=sample_data,
                    total_rows=len(values)
                )
                
                synced_count += 1
                print(f"Successfully synced sheet {sheet_id} for project {project.id}")
                
            except Exception as sheet_error:
                print(f"Failed to sync sheet {sheet_id} for project {project.id}: {sheet_error}")
                continue
        
        # Return success if at least some sheets were synced
        success_rate = synced_count / total_sheets if total_sheets > 0 else 0
        print(f"Synced {synced_count}/{total_sheets} sheets for project {project.id} (success rate: {success_rate:.1%})")
        
        # Consider it successful if we synced at least 50% of sheets
        return {
            'success': success_rate >= 0.5,
            'synced_count': synced_count,
            'total_sheets': total_sheets,
            'success_rate': success_rate
        }
        
    except Exception as e:
        print(f"Error syncing source sheets for project {project.id}: {e}")
        return {
            'success': False,
            'synced_count': 0,
            'total_sheets': len(project.sheet_ids) if project else 0,
            'success_rate': 0.0,
            'error': str(e)
        }

async def process_transformation(project: TransformationProject, user_id: int, sheet_repo: SheetRepository):
    """Process data transformation based on project configuration"""
    try:
        # Get all sheet data for the project
        dataframes = {}
        for sheet_id in project.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id, user_id)
            if sheet:
                df = fetch_full_sheet_data(sheet)
                dataframes[sheet_id] = df
        
        if len(dataframes) < 2:
            return None
        
        # Apply transformations
        join_config = project.join_config or {}
        
        # Get the sheets to join
        sheet_ids = list(dataframes.keys())
        left_df = dataframes[sheet_ids[0]]
        right_df = dataframes[sheet_ids[1]]
        
        if left_df.empty or right_df.empty:
            return None
        
        # Perform join
        join_type = join_config.get('join_type', 'inner')
        left_column = join_config.get('left_column', '')
        right_column = join_config.get('right_column', '')
        
        if not left_column or not right_column:
            return None
        
        joined_df = pd.merge(
            left_df, 
            right_df, 
            left_on=left_column, 
            right_on=right_column, 
            how=join_type,
            suffixes=('_left', '_right')
        )
        
        # Apply transformations if available
        if project.transformations:
            for transform in project.transformations:
                transform_type = transform.get('type')
                if transform_type == 'remove_duplicates':
                    joined_df = joined_df.drop_duplicates()
                elif transform_type == 'filter_nulls':
                    joined_df = joined_df.dropna(subset=[left_column, right_column])
                elif transform_type == 'standardize_case':
                    text_columns = joined_df.select_dtypes(include=['object']).columns
                    for col in text_columns:
                        joined_df[col] = joined_df[col].astype(str).str.lower()
        
        return joined_df
        
    except Exception as e:
        print(f"Error in process_transformation: {e}")
        return None

def store_in_warehouse(df: pd.DataFrame, table_name: str, project_id: int, db: Session):
    """Store transformed data in the warehouse (SQLite)"""
    try:
        # Create data hash for change detection
        data_hash = hashlib.md5(df.to_string().encode()).hexdigest()
        
        # Store dataframe in SQLite
        df.to_sql(table_name, engine, if_exists='replace', index=False)
        
        # Update warehouse metadata
        warehouse_entry = db.query(TransformedDataWarehouse).filter(
            TransformedDataWarehouse.project_id == project_id
        ).first()
        
        # Convert dtypes to JSON-serializable format
        column_schema = {col: str(dtype) for col, dtype in df.dtypes.to_dict().items()}
        
        from datetime import datetime
        
        if warehouse_entry:
            warehouse_entry.row_count = len(df)
            warehouse_entry.column_schema = column_schema
            warehouse_entry.data_hash = data_hash
            warehouse_entry.updated_at = datetime.now()
        else:
            warehouse_entry = TransformedDataWarehouse(
                project_id=project_id,
                table_name=table_name,
                row_count=len(df),
                column_schema=column_schema,
                data_hash=data_hash
            )
            db.add(warehouse_entry)
        
        db.commit()
        
    except Exception as e:
        print(f"Error storing in warehouse: {e}")
        raise

@app.post("/projects/{project_id}/execute-pipeline")
async def execute_pipeline(project_id: int, db: Session = Depends(get_db)):
    """Manually trigger pipeline execution"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Execute pipeline asynchronously
        asyncio.create_task(execute_transformation_pipeline(project_id, current_user.id, db))
        
        return {"message": "Pipeline execution started", "project_id": project_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/{project_id}/charts")
async def create_project_chart(project_id: int, chart_request: ProjectChartCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new chart for a transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Create chart with project_id instead of sheet_id
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        
        # Use a placeholder sheet_id (-1) for project charts to work around NOT NULL constraint
        new_chart = SavedChart(
            sheet_id=-1,  # Placeholder for project charts 
            project_id=project_id,
            chart_name=chart_request.chart_name,
            chart_type=chart_request.chart_type,
            x_axis_column=chart_request.x_axis_column,
            y_axis_column=chart_request.y_axis_column,
            chart_config=chart_request.chart_config,
            created_at=now,
            updated_at=now
        )
        
        db.add(new_chart)
        db.commit()
        db.refresh(new_chart)
        
        return {
            "id": new_chart.id,
            "chart_name": new_chart.chart_name,
            "chart_type": new_chart.chart_type,
            "x_axis_column": new_chart.x_axis_column,
            "y_axis_column": new_chart.y_axis_column,
            "chart_config": new_chart.chart_config,
            "created_at": new_chart.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/{project_id}/execute-all")
async def execute_all_transformations(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Execute all transformation steps and joins in a project in order"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get all transformation steps for this project, ordered by execution_order
        transformation_steps = db.query(AITransformationStep).filter(
            AITransformationStep.project_id == project_id
        ).order_by(AITransformationStep.execution_order.asc()).all()
        
        # Get all joins for this project, ordered by creation time
        join_repo = JoinRepository(db)
        joins = join_repo.get_joins_by_project(project_id)
        
        if not transformation_steps and not joins:
            return {"message": "No transformation steps or joins found", "executed_steps": []}
        
        executed_steps = []
        failed_steps = []
        
        # Import pandas at function level to avoid scope issues
        import pandas as pd
        from datetime import datetime, timezone
        import time
        
        # Create a combined list of operations to execute, sorted by creation time
        operations = []
        
        # Add transformation steps with type indicator
        for step in transformation_steps:
            operations.append({
                'type': 'transformation',
                'item': step,
                'created_at': step.created_at
            })
        
        # Add joins with type indicator
        for join in joins:
            operations.append({
                'type': 'join',
                'item': join,
                'created_at': join.created_at
            })
        
        # Sort by creation time
        operations.sort(key=lambda x: x['created_at'])
        
        # Execute each operation in order
        for operation in operations:
            start_time = time.time()
            
            if operation['type'] == 'transformation':
                step = operation['item']
                # Execute transformation step (reuse the existing execute logic)
                step.status = 'running'
                step.error_message = None
                db.commit()
                
                # Get upstream data using unified helper function
                sheet_data = load_upstream_data(step, current_user, db)
                
                # Set the main df for transformation
                df = None
                if sheet_data:
                    df = list(sheet_data.values())[0]
                else:
                    df = pd.DataFrame({'col1': [1, 2, 3], 'col2': ['a', 'b', 'c']})
                
                # Execute the transformation code
                exec_globals = {
                    'df': df, 
                    'pd': pd, 
                    'numpy': __import__('numpy'),
                    **sheet_data
                }
                
                try:
                    exec(step.generated_code, exec_globals)
                except AttributeError as e:
                    # Handle common case where generated code tries to call string methods on numeric types
                    if 'zfill' in str(e) and 'float' in str(e):
                        raise Exception(f"Generated code error: Trying to use zfill() on a numeric value. "
                                      f"This usually happens when a column contains numbers but the code expects strings. "
                                      f"Try converting to string first: df['column'].astype(str).str.zfill(n). "
                                      f"Original error: {str(e)}")
                    else:
                        raise e
                except Exception as e:
                    raise Exception(f"Error executing generated transformation code: {str(e)}")
                result_df = exec_globals.get('df', df)
                
                # Create table name and store results
                table_name = f"transform_step_{step.id}_{step.step_name.lower().replace(' ', '_').replace('-', '_')}"
                import re
                table_name = re.sub(r'[^\w]', '_', table_name)
                
                if result_df is not None and not result_df.empty:
                    store_in_warehouse(result_df, table_name, step.project_id, db)
                
                # Update step with success
                execution_time_ms = int((time.time() - start_time) * 1000)
                step.status = 'completed'
                step.last_executed = datetime.now(timezone.utc)
                step.execution_time_ms = execution_time_ms
                step.output_columns = result_df.columns.tolist() if result_df is not None else []
                step.code_explanation = f"Output table: {table_name}\n\n{step.code_explanation or ''}"
                
                db.commit()
                
                executed_steps.append({
                    "step_id": step.id,
                    "step_name": step.step_name,
                    "status": "completed",
                    "execution_time_ms": execution_time_ms,
                    "output_table": table_name,
                    "output_shape": result_df.shape if result_df is not None else None
                })
                
            # Handle transformation execution errors  
            if False:  # This is a placeholder - we'll handle errors properly later
                execution_time_ms = int((time.time() - start_time) * 1000)
                step.status = 'failed'
                step.error_message = "Execution failed"
                step.last_executed = datetime.now(timezone.utc)
                step.execution_time_ms = execution_time_ms
                db.commit()
                
                failed_steps.append({
                    "step_id": step.id,
                    "step_name": step.step_name,
                    "status": "failed",
                    "error": str(exec_error),
                    "execution_time_ms": execution_time_ms
                })
            
            elif operation['type'] == 'join':
                join = operation['item']
                try:
                    # Execute join operation by calling the existing execute_join endpoint logic
                    result = await execute_join(project_id, join.id, db)
                    
                    execution_time_ms = int((time.time() - start_time) * 1000)
                    executed_steps.append({
                        "join_id": join.id,
                        "join_name": join.name,
                        "status": "completed",
                        "execution_time_ms": execution_time_ms,
                        "row_count": result.get('row_count', 0) if isinstance(result, dict) else 0
                    })
                    
                except Exception as exec_error:
                    execution_time_ms = int((time.time() - start_time) * 1000)
                    failed_steps.append({
                        "join_id": join.id,
                        "join_name": join.name,
                        "status": "failed",
                        "error": str(exec_error),
                        "execution_time_ms": execution_time_ms
                    })
        
        return {
            "message": f"Executed {len(executed_steps)} operations successfully, {len(failed_steps)} failed",
            "executed_steps": executed_steps,
            "failed_steps": failed_steps,
            "total_operations": len(operations)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/data-sources")
async def get_project_data_sources(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get available data sources (original sheets + transformed tables) for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Use the unified table discovery method
        data_sources = project_repo.get_all_available_tables(current_user.id, project_id)
        
        # Format for backward compatibility
        formatted_sources = []
        for source in data_sources:
            formatted_source = {
                "id": f"{source['type']}_{source['id']}",
                "name": source['name'],
                "type": source['type'],
                "source_type": "original" if source['type'] == 'sheet' else "transformed",
                "columns": source['columns'],
                "status": source['status']
            }
            
            # Add table_name for non-sheet sources
            if 'table_name' in source:
                formatted_source['table_name'] = source['table_name']
                
            # Try to get row count for database tables
            if source['type'] != 'sheet' and 'table_name' in source:
                try:
                    with engine.connect() as conn:
                        result = conn.execute(text(f"SELECT COUNT(*) as count FROM \"{source['table_name']}\""))
                        row_count = result.fetchone()[0]
                        formatted_source['row_count'] = row_count
                except Exception as e:
                    print(f"Could not get row count for table {source.get('table_name', 'unknown')}: {e}")
                    formatted_source['row_count'] = 0
            elif source['type'] == 'sheet':
                # For sheets, we can add row count from the sheet data
                sheet_repo = SheetRepository(db)
                sheet = sheet_repo.get_sheet_by_id(source['id'], current_user.id)
                if sheet:
                    formatted_source['row_count'] = sheet.total_rows
            
            formatted_sources.append(formatted_source)
        
        return {"data_sources": formatted_sources}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/table-data/{table_id}")
async def get_table_data(project_id: int, table_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get data from a specific table (sheet or transformed) for charting"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        import pandas as pd
        
        if table_id.startswith("sheet_"):
            # Get data from original sheet
            sheet_id = int(table_id.replace("sheet_", ""))
            sheet_repo = SheetRepository(db)
            sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
            
            if not sheet:
                raise HTTPException(status_code=404, detail="Sheet not found")
            
            # Convert sheet data to DataFrame format
            data = []
            for row in sheet.sample_data:
                row_dict = {}
                for i, col in enumerate(sheet.columns):
                    row_dict[col] = row[i] if i < len(row) else None
                data.append(row_dict)
            
            return {
                "data": data,
                "columns": sheet.columns,
                "row_count": len(data),
                "source_type": "sheet"
            }
            
        elif table_id.startswith("transform_"):
            # Get data from transformed table
            step_id = int(table_id.replace("transform_", ""))
            step = db.query(AITransformationStep).filter(
                AITransformationStep.id == step_id,
                AITransformationStep.project_id == project_id,
                AITransformationStep.status == 'completed'
            ).first()
            
            if not step:
                raise HTTPException(status_code=404, detail="Transformation step not found")
            
            # Generate the correct table name that matches the storage pattern
            if step.output_table_name:
                # Use custom table name if provided
                import re
                table_name = re.sub(r'[^\w]', '_', step.output_table_name.lower())
            else:
                # Use default pattern - match the exact same logic as storage
                step_name_clean = step.step_name.lower().replace(' ', '_').replace('-', '_')
                table_name = f"transform_step_{step_id}_{step_name_clean}"
                # Apply the same regex cleaning as storage
                import re
                table_name = re.sub(r'[^\w]', '_', table_name)
            
            # Read data from SQLite table
            try:
                df = pd.read_sql_table(table_name, engine)
            except Exception:
                # If the expected table name doesn't work, try to find any table with step_id
                try:
                    with engine.connect() as conn:
                        result = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"%transform_step_{step_id}%",))
                        tables = result.fetchall()
                        if tables:
                            table_name = tables[0][0]  # Use the first matching table
                            df = pd.read_sql_table(table_name, engine)
                        else:
                            raise HTTPException(status_code=404, detail="Transformation output table not found")
                except Exception as e:
                    raise HTTPException(status_code=404, detail=f"Error reading transformation data: {str(e)}")
                data = df.to_dict('records')
                return {
                    "data": data,
                    "columns": df.columns.tolist(),
                    "row_count": len(data),
                    "source_type": "transformed",
                    "table_name": table_name
                }
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Could not read table data: {str(e)}")
        
        else:
            raise HTTPException(status_code=400, detail="Invalid table ID format")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/data")
async def get_project_data(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get transformed data from warehouse for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check if pipeline has been executed and data exists in warehouse
        warehouse_entry = db.query(TransformedDataWarehouse).filter(
            TransformedDataWarehouse.project_id == project_id
        ).first()
        
        if not warehouse_entry or not project.warehouse_table_name:
            # No transformed data available yet
            return {
                "total_rows": 0,
                "preview_data": [],
                "columns": [],
                "pipeline_status": project.pipeline_status or 'draft'
            }
        
        # Fetch data from warehouse table
        try:
            query = f"SELECT * FROM {project.warehouse_table_name} LIMIT 1000"
            with engine.connect() as conn:
                result = conn.execute(text(query))
                rows = result.fetchall()
                columns = list(result.keys())
                
                # Convert to list format for frontend
                preview_data = [columns] + [list(row) for row in rows[:100]]  # Limit preview to 100 rows
                
                return {
                    "total_rows": warehouse_entry.row_count,
                    "preview_data": preview_data,
                    "columns": columns,
                    "pipeline_status": project.pipeline_status or 'completed',
                    "last_pipeline_run": project.last_pipeline_run.isoformat() if project.last_pipeline_run else None
                }
                
        except Exception as e:
            print(f"Error reading from warehouse: {e}")
            return {
                "total_rows": 0,
                "preview_data": [],
                "columns": [],
                "pipeline_status": project.pipeline_status or 'failed'
            }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/history")
async def get_project_pipeline_history(project_id: int, limit: int = 20, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get pipeline execution history for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get pipeline execution history
        history_entries = db.query(PipelineExecutionHistory).filter(
            PipelineExecutionHistory.project_id == project_id
        ).order_by(PipelineExecutionHistory.started_at.desc()).limit(limit).all()
        
        # Format history entries
        formatted_history = []
        for entry in history_entries:
            formatted_entry = {
                "id": entry.id,
                "status": entry.status,
                "started_at": entry.started_at.isoformat() + 'Z',
                "completed_at": entry.completed_at.isoformat() + 'Z' if entry.completed_at else None,
                "duration_seconds": entry.duration_seconds,
                "sheets_synced": entry.sheets_synced,
                "total_sheets": entry.total_sheets,
                "rows_processed": entry.rows_processed,
                "error_message": entry.error_message
            }
            formatted_history.append(formatted_entry)
        
        return {
            "history": formatted_history,
            "total_executions": len(formatted_history)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# AI Transformation Endpoints
@app.post("/projects/{project_id}/ai-transformations")
async def create_ai_transformation_step(
    project_id: int,
    request: AITransformationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new AI-powered transformation step"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Verify project exists
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(current_user.id, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get sample data from upstream sources for AI context
        sample_data = []
        columns = []
        
        # If upstream sheets are specified, get their data
        if request.upstream_sheet_ids:
            sheet_repo = SheetRepository(db)
            for sheet_id in request.upstream_sheet_ids:
                sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
                if sheet and sheet.sample_data:
                    sample_data.extend(sheet.sample_data)
                    if sheet.columns:
                        columns.extend(sheet.columns)
        
        # Remove duplicates and limit sample data
        if sample_data:
            sample_data = sample_data[:10]  # Limit to 10 rows
        columns = list(set(columns))  # Remove duplicates
        
        # Generate transformation code using AI
        ai_result = await ai_service.generate_transformation_code(
            user_prompt=request.user_prompt,
            sample_data=sample_data,
            columns=columns
        )
        
        if not ai_result.get('success'):
            raise HTTPException(
                status_code=400, 
                detail=f"Failed to generate transformation code: {ai_result.get('error', 'Unknown error')}"
            )
        
        # Create the transformation step
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        
        transformation_step = AITransformationStep(
            project_id=project_id,
            step_name=request.step_name,
            user_prompt=request.user_prompt,
            output_table_name=request.output_table_name,
            generated_code=ai_result['code'],
            code_summary=ai_result['summary'],
            code_explanation=ai_result['explanation'],
            input_columns=ai_result['input_columns'],
            output_columns=ai_result['estimated_output_columns'],
            upstream_step_ids=request.upstream_step_ids or [],
            upstream_sheet_ids=request.upstream_sheet_ids or [],
            upstream_tables=request.upstream_tables or [],
            canvas_position=request.canvas_position or {"x": 0, "y": 0},
            execution_order=0,  # Will be calculated based on dependencies
            status='draft',
            created_at=now,
            updated_at=now
        )
        
        db.add(transformation_step)
        db.commit()
        db.refresh(transformation_step)
        
        return {
            "id": transformation_step.id,
            "step_name": transformation_step.step_name,
            "user_prompt": transformation_step.user_prompt,
            "generated_code": transformation_step.generated_code,
            "code_summary": transformation_step.code_summary,
            "code_explanation": transformation_step.code_explanation,
            "status": transformation_step.status,
            "canvas_position": transformation_step.canvas_position,
            "created_at": transformation_step.created_at.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/ai-transformations")
async def get_project_transformation_steps(project_id: int, db: Session = Depends(get_db)):
    """Get all AI transformation steps for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get all transformation steps for the project
        steps = db.query(AITransformationStep).filter(
            AITransformationStep.project_id == project_id
        ).order_by(AITransformationStep.execution_order, AITransformationStep.created_at).all()
        
        return {
            "steps": [
                {
                    "id": step.id,
                    "step_name": step.step_name,
                    "user_prompt": step.user_prompt,
                    "generated_code": step.generated_code,
                    "code_summary": step.code_summary,
                    "code_explanation": step.code_explanation,
                    "output_table_name": step.output_table_name,
                    "input_columns": step.input_columns,
                    "output_columns": step.output_columns,
                    "upstream_step_ids": step.upstream_step_ids,
                    "upstream_sheet_ids": step.upstream_sheet_ids,
                    "canvas_position": step.canvas_position,
                    "execution_order": step.execution_order,
                    "status": step.status,
                    "error_message": step.error_message,
                    "last_executed": step.last_executed.isoformat() if step.last_executed else None,
                    "execution_time_ms": step.execution_time_ms,
                    "created_at": step.created_at.isoformat(),
                    "updated_at": step.updated_at.isoformat()
                }
                for step in steps
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/ai-transformations/{step_id}")
async def update_transformation_step(
    step_id: int, 
    request: TransformationStepUpdateRequest, 
    db: Session = Depends(get_db)
):
    """Update an AI transformation step"""
    from datetime import datetime, timezone
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get the transformation step
        step = db.query(AITransformationStep).filter(
            AITransformationStep.id == step_id
        ).first()
        
        if not step:
            raise HTTPException(status_code=404, detail="Transformation step not found")
        
        # Update fields if provided
        if request.step_name is not None:
            step.step_name = request.step_name
        if request.user_prompt is not None:
            step.user_prompt = request.user_prompt
            # Regenerate code if prompt changed
            # TODO: Implement code regeneration
        if request.output_table_name is not None:
            step.output_table_name = request.output_table_name.strip() if request.output_table_name.strip() else None
        if request.upstream_step_ids is not None:
            step.upstream_step_ids = request.upstream_step_ids
        if request.upstream_sheet_ids is not None:
            step.upstream_sheet_ids = request.upstream_sheet_ids
        if request.canvas_position is not None:
            step.canvas_position = request.canvas_position
        
        step.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(step)
        
        result = {
            "id": step.id,
            "step_name": step.step_name,
            "user_prompt": step.user_prompt,
            "output_table_name": step.output_table_name,
            "canvas_position": step.canvas_position,
            "updated_at": step.updated_at.isoformat()
        }
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/ai-transformations/{step_id}")
async def delete_transformation_step(step_id: int, db: Session = Depends(get_db)):
    """Delete an AI transformation step"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get the transformation step
        step = db.query(AITransformationStep).filter(
            AITransformationStep.id == step_id
        ).first()
        
        if not step:
            raise HTTPException(status_code=404, detail="Transformation step not found")
        
        # Delete output table if it exists
        if step.output_table_name:
            try:
                with engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {step.output_table_name}"))
                    conn.commit()
            except Exception as e:
                print(f"Warning: Failed to drop transformation table {step.output_table_name}: {e}")
        else:
            # Try to drop default table name pattern
            try:
                step_name_clean = step.step_name.lower().replace(' ', '_').replace('-', '_')
                table_name = f"transform_step_{step.id}_{step_name_clean}"
                import re
                table_name = re.sub(r'[^\w]', '_', table_name)
                with engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                    conn.commit()
            except Exception as e:
                print(f"Warning: Failed to drop default transformation table for step {step.id}: {e}")
        
        db.delete(step)
        db.commit()
        
        return {"message": "Transformation step deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai-transformations/{step_id}/execute")
async def execute_transformation_step(step_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Execute a single AI transformation step"""
    try:
        
        # Get the transformation step
        step = db.query(AITransformationStep).filter(
            AITransformationStep.id == step_id
        ).first()
        
        if not step:
            raise HTTPException(status_code=404, detail="Transformation step not found")
        
        # Update step status to running  
        from datetime import datetime, timezone
        import pandas as pd
        import time
        start_time = time.time()
        
        step.status = 'running'
        step.error_message = None
        db.commit()
        
        try:
            # Get upstream data using unified helper function
            sheet_data = load_upstream_data(step, current_user, db)
            
            # If we have sheet data, use the first one as 'df' for the transformation
            df = None
            if sheet_data:
                df = list(sheet_data.values())[0]
            else:
                # Create a minimal test DataFrame if no upstream data
                df = pd.DataFrame({'col1': [1, 2, 3], 'col2': ['a', 'b', 'c']})
            
            # Execute the generated pandas code
            exec_globals = {
                'df': df, 
                'pd': pd, 
                'numpy': __import__('numpy'),
                **sheet_data  # Include all sheet data
            }
            
            # Execute the transformation code
            try:
                exec(step.generated_code, exec_globals)
            except AttributeError as e:
                # Handle common case where generated code tries to call string methods on numeric types
                if 'zfill' in str(e) and 'float' in str(e):
                    raise Exception(f"Generated code error: Trying to use zfill() on a numeric value. "
                                  f"This usually happens when a column contains numbers but the code expects strings. "
                                  f"Try converting to string first: df['column'].astype(str).str.zfill(n). "
                                  f"Original error: {str(e)}")
                else:
                    raise e
            except Exception as e:
                raise Exception(f"Error executing generated transformation code: {str(e)}")
            
            # Get the result DataFrame
            result_df = exec_globals.get('df', df)
            
            # Create a unique table name for this transformation result
            if step.output_table_name:
                # Use custom table name if provided
                import re
                table_name = re.sub(r'[^\w]', '_', step.output_table_name.lower())
            else:
                # Use default pattern - match the exact same logic as retrieval
                step_name_clean = step.step_name.lower().replace(' ', '_').replace('-', '_')
                table_name = f"transform_step_{step_id}_{step_name_clean}"
                # Ensure table name is valid (remove special characters)
                import re
                table_name = re.sub(r'[^\w]', '_', table_name)
            
            # Store the transformed data in the warehouse
            if result_df is not None and not result_df.empty:
                store_in_warehouse(result_df, table_name, step.project_id, db)
            
            # Update step with success status and table name
            execution_time_ms = int((time.time() - start_time) * 1000)
            step.status = 'completed'
            step.last_executed = datetime.now(timezone.utc)
            step.execution_time_ms = execution_time_ms
            step.output_columns = result_df.columns.tolist() if result_df is not None else []
            
            # Store the actual output table name in the proper field
            # Preserve the custom output_table_name if it was set, otherwise store the generated table_name
            # Don't overwrite a custom name that was already set
            
            # Also store it in code_explanation for backward compatibility
            step.code_explanation = f"Output table: {table_name}\n\n{step.code_explanation or ''}"
            
            db.commit()
            
            return {
                "message": "Step executed successfully",
                "step_id": step_id,
                "status": "completed",
                "execution_time_ms": execution_time_ms,
                "output_shape": result_df.shape if result_df is not None else None,
                "output_columns": step.output_columns,
                "output_table_name": table_name
            }
            
        except Exception as exec_error:
            # Update step with error status
            execution_time_ms = int((time.time() - start_time) * 1000)
            step.status = 'failed'
            step.error_message = str(exec_error)
            step.last_executed = datetime.now(timezone.utc)
            step.execution_time_ms = execution_time_ms
            
            db.commit()
            
            return {
                "message": "Step execution failed",
                "step_id": step_id,
                "status": "failed",
                "error": str(exec_error),
                "execution_time_ms": execution_time_ms
            }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sheets/{sheet_id}/data")
async def get_sheet_data(sheet_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get full data from a specific sheet for viewing"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id, current_user.id)
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        # Get full sheet data (not just sample)
        try:
            df = fetch_full_sheet_data(sheet)
            
            # Convert DataFrame to the format expected by the frontend
            columns = df.columns.tolist()
            data_rows = []
            
            # Convert DataFrame rows to list of lists, handling various data types
            for _, row in df.iterrows():
                row_data = []
                for value in row:
                    if pd.isna(value):
                        row_data.append(None)
                    elif isinstance(value, (int, float)):
                        row_data.append(value)
                    else:
                        row_data.append(str(value))
                data_rows.append(row_data)
            
            return {
                "columns": columns,
                "data": data_rows,
                "total_rows": len(data_rows),
                "table_name": sheet.title
            }
            
        except Exception as e:
            # Fallback to sample data if full data fetch fails
            if sheet.sample_data and len(sheet.sample_data) > 1:
                return {
                    "columns": sheet.sample_data[0],
                    "data": sheet.sample_data[1:],
                    "total_rows": sheet.total_rows or len(sheet.sample_data) - 1,
                    "table_name": sheet.title
                }
            else:
                raise HTTPException(status_code=500, detail=f"Could not load sheet data: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ai-transformations/{step_id}/data")
async def get_transformation_data(step_id: int, db: Session = Depends(get_db)):
    """Get output data from a completed AI transformation step"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get the transformation step
        step = db.query(AITransformationStep).filter(
            AITransformationStep.id == step_id
        ).first()
        
        if not step:
            raise HTTPException(status_code=404, detail="Transformation step not found")
        
        if step.status != 'completed':
            raise HTTPException(status_code=400, detail="Transformation step is not completed")
        
        # Use the output_table_name field first, then fall back to code_explanation
        table_name = None
        
        # First priority: use the custom output_table_name if it exists
        if step.output_table_name and step.output_table_name.strip():
            import re
            table_name = re.sub(r'[^\w]', '_', step.output_table_name.lower())
        
        # Second priority: extract from code_explanation
        if not table_name and step.code_explanation:
            lines = step.code_explanation.split('\n')
            for line in lines:
                if line.startswith('Output table:'):
                    table_name = line.split(':', 2)[1].strip()
                    break
        
        # Last resort: generate using default pattern 
        if not table_name:
            step_name_clean = step.step_name.lower().replace(' ', '_').replace('-', '_')
            table_name = f"transform_step_{step_id}_{step_name_clean}"
            # Apply the same regex cleaning as storage
            import re
            table_name = re.sub(r'[^\w]', '_', table_name)
        
        # Try to read the data from the SQLite database using the same engine as storage
        from database import engine
        import sqlite3
        
        
        try:
            # Use the same database connection as the storage function
            conn = engine.connect()
            
            
            # Check if table exists using pandas to query
            try:
                df = pd.read_sql_query(f"SELECT * FROM `{table_name}`", conn)
            except Exception:
                # If the expected table name doesn't work, try to find any table with step_id
                try:
                    from sqlalchemy import text
                    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE :pattern"), {"pattern": f"%transform_step_{step_id}%"})
                    tables = result.fetchall()
                    if tables:
                        table_name = tables[0][0]  # Use the first matching table
                        df = pd.read_sql_query(f"SELECT * FROM `{table_name}`", conn)
                    else:
                        raise HTTPException(status_code=404, detail=f"Transformation output table not found. The transformation may not have been executed successfully yet.")
                except Exception as e:
                    raise HTTPException(status_code=404, detail=f"Error retrieving transformation data: {str(e)}")
            
            conn.close()
            
            # Convert DataFrame to the format expected by the frontend
            columns = df.columns.tolist()
            data_rows = []
            
            # Convert DataFrame rows to list of lists, handling various data types
            for _, row in df.iterrows():
                row_data = []
                for value in row:
                    if pd.isna(value):
                        row_data.append(None)
                    elif isinstance(value, (int, float)):
                        row_data.append(value)
                    else:
                        row_data.append(str(value))
                data_rows.append(row_data)
            
            result = {
                "columns": columns,
                "data": data_rows,
                "total_rows": len(data_rows),
                "table_name": table_name
            }
            return result
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading transformation data: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ai-transformations/{step_id}/recommendations")
async def get_transformation_recommendations(step_id: int, db: Session = Depends(get_db)):
    """Get chart recommendations for a completed AI transformation step"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get the transformation step
        step = db.query(AITransformationStep).filter(
            AITransformationStep.id == step_id
        ).first()
        
        if not step:
            raise HTTPException(status_code=404, detail="Transformation step not found")
        
        if step.status != 'completed':
            return {"recommendations": []}
        
        # Generate recommendations based on output columns
        recommendations = []
        if step.output_columns and len(step.output_columns) > 0:
            columns = step.output_columns
            
            # Categorize columns based on names (heuristic)
            numeric_columns = []
            categorical_columns = []
            date_columns = []
            
            for col in columns:
                col_lower = col.lower()
                if any(keyword in col_lower for keyword in ['amount', 'price', 'cost', 'value', 'count', 'total', 'sum', 'avg', 'score', 'rate', 'percent', 'number', 'qty', 'quantity']):
                    numeric_columns.append(col)
                elif any(keyword in col_lower for keyword in ['date', 'time', 'created', 'updated', 'modified']):
                    date_columns.append(col)
                else:
                    categorical_columns.append(col)
            
            # Generate basic recommendations
            if categorical_columns:
                main_cat = categorical_columns[0]
                recommendations.append({
                    "type": "pie",
                    "title": f"Distribution of {main_cat}",
                    "description": f"Breakdown of {main_cat.lower()} values from transformation",
                    "x_axis": main_cat,
                    "y_axis": None,
                    "reason": f"Shows the distribution of categories in your transformed data"
                })
                
                recommendations.append({
                    "type": "bar",
                    "title": f"Count by {main_cat}",
                    "description": f"Count of items for each {main_cat.lower()}",
                    "x_axis": main_cat,
                    "y_axis": None,
                    "reason": f"Visualizes frequency of each {main_cat.lower()} category"
                })
            
            # Numeric analysis
            if numeric_columns and categorical_columns:
                num_col = numeric_columns[0]
                cat_col = categorical_columns[0]
                recommendations.append({
                    "type": "bar",
                    "title": f"{num_col} by {cat_col}",
                    "description": f"Compare {num_col.lower()} across different {cat_col.lower()}",
                    "x_axis": cat_col,
                    "y_axis": num_col,
                    "reason": f"Shows how {num_col} varies across {cat_col} categories"
                })
            
            # Correlation analysis
            if len(numeric_columns) >= 2:
                recommendations.append({
                    "type": "scatter",
                    "title": f"{numeric_columns[0]} vs {numeric_columns[1]}",
                    "description": f"Relationship between {numeric_columns[0]} and {numeric_columns[1]}",
                    "x_axis": numeric_columns[0],
                    "y_axis": numeric_columns[1],
                    "reason": f"Identifies potential correlations in your transformed data"
                })
            
            # Time series if date column exists
            if date_columns and numeric_columns:
                date_col = date_columns[0]
                num_col = numeric_columns[0]
                recommendations.append({
                    "type": "line",
                    "title": f"{num_col} Over Time",
                    "description": f"Trend of {num_col.lower()} over {date_col.lower()}",
                    "x_axis": date_col,
                    "y_axis": num_col,
                    "reason": f"Shows trends and patterns over time"
                })
        
        return {"recommendations": recommendations[:6]}  # Return top 6 recommendations
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/joins/{join_id}/recommendations")
async def get_join_recommendations(join_id: int, db: Session = Depends(get_db)):
    """Get chart recommendations for a completed join operation"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get the join operation
        join_repo = JoinRepository(db)
        join_op = join_repo.get_join_by_id(join_id)
        
        if not join_op:
            raise HTTPException(status_code=404, detail="Join operation not found")
            
        if join_op.status != 'completed':
            return {"recommendations": []}
        
        # Generate recommendations based on output columns
        recommendations = []
        if join_op.output_columns and len(join_op.output_columns) > 0:
            columns = join_op.output_columns
            
            # Categorize columns based on names (heuristic)
            numeric_columns = []
            categorical_columns = []
            date_columns = []
            
            for col in columns:
                col_lower = col.lower()
                if any(word in col_lower for word in ['amount', 'count', 'total', 'sum', 'value', 'price', 'cost', 'revenue', 'age', 'score', 'rating', 'number', 'qty', 'quantity']):
                    numeric_columns.append(col)
                elif any(word in col_lower for word in ['date', 'time', 'created', 'updated', 'timestamp']):
                    date_columns.append(col)
                else:
                    categorical_columns.append(col)
            
            # Generate basic recommendations for joined data
            if categorical_columns:
                main_cat = categorical_columns[0]
                recommendations.append({
                    "type": "pie",
                    "title": f"Distribution of {main_cat}",
                    "description": f"Breakdown of {main_cat.lower()} values from joined tables",
                    "x_axis": main_cat,
                    "y_axis": None,
                    "reason": f"Shows the distribution of categories in your joined data"
                })
                
                recommendations.append({
                    "type": "bar",
                    "title": f"Count by {main_cat}",
                    "description": f"Count of items for each {main_cat.lower()}",
                    "x_axis": main_cat,
                    "y_axis": None,
                    "reason": f"Visualizes frequency of each {main_cat.lower()} category"
                })
            
            # Numeric analysis with joined data context
            if numeric_columns and categorical_columns:
                num_col = numeric_columns[0]
                cat_col = categorical_columns[0]
                recommendations.append({
                    "type": "bar",
                    "title": f"{num_col} by {cat_col}",
                    "description": f"Compare {num_col.lower()} across different {cat_col.lower()}",
                    "x_axis": cat_col,
                    "y_axis": num_col,
                    "reason": f"Shows how {num_col} varies across {cat_col} from joined tables"
                })
            
            # Correlation analysis for joined data
            if len(numeric_columns) >= 2:
                recommendations.append({
                    "type": "scatter",
                    "title": f"{numeric_columns[0]} vs {numeric_columns[1]}",
                    "description": f"Relationship between {numeric_columns[0]} and {numeric_columns[1]}",
                    "x_axis": numeric_columns[0],
                    "y_axis": numeric_columns[1],
                    "reason": f"Identifies correlations that emerge from joining your data sources"
                })
            
            # Time series analysis with joined data
            if date_columns and numeric_columns:
                date_col = date_columns[0]
                num_col = numeric_columns[0]
                recommendations.append({
                    "type": "line",
                    "title": f"{num_col} Over Time (Joined Data)",
                    "description": f"Trend of {num_col.lower()} over {date_col.lower()} from joined tables",
                    "x_axis": date_col,
                    "y_axis": num_col,
                    "reason": f"Shows trends over time from your joined datasets"
                })
            
            # Multi-table analysis specific to joins
            if len(categorical_columns) >= 2:
                cat1 = categorical_columns[0]
                cat2 = categorical_columns[1]
                recommendations.append({
                    "type": "bar",
                    "title": f"{cat2} Distribution by {cat1}",
                    "description": f"Cross-table analysis of {cat2.lower()} across different {cat1.lower()}",
                    "x_axis": cat1,
                    "y_axis": cat2,
                    "reason": f"Reveals patterns that emerge from joining different data sources"
                })
        
        return {"recommendations": recommendations[:6]}  # Return top 6 recommendations
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_with_data(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Chat with LLM about charts and data with rich context and chart creation capability
    """
    try:
        # Generate context based on what the user is viewing
        context_generator = DataContextGenerator(db)
        context = context_generator.generate_chat_context(
            chart_id=request.chart_id,
            sheet_id=request.sheet_id,
            project_id=request.project_id
        )
        
        # Check if context generation failed
        if "error" in context:
            raise HTTPException(status_code=404, detail=context["error"])
        
        # Get chart tools (creation and lookup)
        tools = get_chart_tools()
        
        # Chat with LLM using the generated context and tools
        llm_response = await llm_service.chat_with_context(request.message, context, tools)
        
        # Handle different response types
        if llm_response.get("type") == "function_call":
            # Execute function calls
            chart_service = ChartCreationService(db)
            
            final_response = llm_response.get("content", "")
            created_charts = []
            
            for tool_call in llm_response.get("tool_calls", []):
                if hasattr(tool_call, 'name') and tool_call.name == "create_chart":
                    # Extract parameters
                    params = tool_call.input
                    
                    # Add sheet_id or project_id from context
                    if request.sheet_id:
                        params["sheet_id"] = request.sheet_id
                    elif request.project_id:
                        params["project_id"] = request.project_id
                    
                    # Create the chart
                    result = await chart_service.create_chart(**params)
                    created_charts.append(result)
                    
                    if result["success"]:
                        final_response += f"\n\n{result['message']}"
                    else:
                        final_response += f"\n\n❌ Error creating chart: {result['error']}"
                
                elif hasattr(tool_call, 'name') and tool_call.name == "find_chart":
                    # Find chart by name
                    params = tool_call.input
                    result = await chart_service.find_chart_by_name(
                        chart_name=params["chart_name"],
                        sheet_id=request.sheet_id,
                        project_id=request.project_id
                    )
                    
                    if result["success"]:
                        chart_info = result["chart"]
                        # Generate enhanced context for the found chart
                        enhanced_context = context_generator.get_chart_context(chart_info["id"])
                        
                        # Create a detailed context for Claude to analyze
                        analysis_context = {
                            "chart_details": chart_info,
                            "data_context": enhanced_context
                        }
                        
                        # Ask Claude to analyze and explain the chart
                        analysis_prompt = f"Please analyze and explain the '{chart_info['name']}' chart based on the provided context. Focus on insights, patterns, and what the data shows."
                        analysis_response = await llm_service.chat_with_context(analysis_prompt, analysis_context)
                        
                        
                        if analysis_response.get("type") == "text":
                            final_response += f"\n\n📊 **{chart_info['name']}** Analysis:\n\n{analysis_response.get('content', '')}"
                        else:
                            final_response += f"\n\n📊 Found chart: **{chart_info['name']}** but couldn't generate analysis."
                    else:
                        final_response += f"\n\n❌ {result['error']}"
            
            return {
                "response": final_response,
                "context_provided": bool(context),
                "charts_created": created_charts,
                "type": "function_call"
            }
        
        elif llm_response.get("type") == "error":
            return {
                "response": llm_response.get("content", "Unknown error"),
                "context_provided": bool(context),
                "type": "error"
            }
        
        else:
            # Regular text response
            return {
                "response": llm_response.get("content", ""),
                "context_provided": bool(context),
                "type": "text"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        # Handle LLM service errors gracefully
        error_message = str(e)
        if "LLM_API_KEY" in error_message:
            raise HTTPException(status_code=500, detail="LLM service not configured. Please check API credentials.")
        else:
            raise HTTPException(status_code=500, detail=f"Chat service error: {error_message}")

# ============================================
# AI-Powered Chart Analysis Chat Endpoints
# ============================================

from services.ai_factory import AIServiceFactory
from services.chart_context import ChartContextService
from models.chat_models import ChatRequest, ChatResponse, DefaultQuestionsRequest, DefaultQuestionsResponse, DefaultQuestion

@app.post("/chat/analyze-chart", response_model=ChatResponse)
async def analyze_chart_with_ai(request: ChatRequest, db: Session = Depends(get_db)):
    """Analyze chart data using AI"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Initialize services
        ai_service = AIServiceFactory.create_service()
        chart_context_service = ChartContextService(db)
        
        # Check if user is asking about a specific chart by name (if no chart_id provided)
        detected_chart_id = request.chart_id
        if not detected_chart_id:
            # Try to detect chart name in the message
            try:
                # Get all available charts to match against
                all_charts = chart_context_service.chart_repo.get_all_charts() 
                for chart in all_charts:
                    chart_name_lower = chart.chart_name.lower()
                    message_lower = request.message.lower()
                    
                    # Check if chart name is mentioned in the message
                    if (chart_name_lower in message_lower or 
                        f"'{chart_name_lower}'" in message_lower or
                        f'"{chart_name_lower}"' in message_lower):
                        detected_chart_id = chart.id
                        break
            except:
                pass
        
        # If chart_id is provided or detected, get chart context
        chart_data_used = False
        charts_referenced = []
        
        if detected_chart_id:
            try:
                chart_context = await chart_context_service.get_chart_context(detected_chart_id)
                charts_referenced = [detected_chart_id]
                chart_data_used = True
                
                # Format messages for AI analysis
                messages = ai_service.format_chart_analysis_prompt(
                    chart_data=chart_context,
                    user_question=request.message,
                    context=request.context
                )
                
            except ValueError as e:
                # Chart not found, proceed with general question
                chart_context = {}
                messages = [
                    {"role": "system", "content": "You are a data analyst AI assistant. The user asked about a chart that couldn't be found. Please provide general guidance."},
                    {"role": "user", "content": request.message}
                ]
                
        else:
            # General question without specific chart context - check if they need data exploration help
            message_lower = request.message.lower()
            
            if any(keyword in message_lower for keyword in ['data source', 'data available', 'explore data', 'connected sheets']):
                # User is asking about data sources - provide helpful data exploration
                try:
                    # Get available data sources from database
                    sheet_repo = SheetRepository(db)
                    connected_sheets = sheet_repo.get_all_sheets()
                    
                    data_sources_info = []
                    for sheet in connected_sheets[:5]:  # Limit to first 5
                        ds_info = f"- {sheet.sheet_name} (Google Sheet, connected {sheet.connected_at.strftime('%Y-%m-%d') if sheet.connected_at else 'recently'})"
                        data_sources_info.append(ds_info)
                    
                    system_content = f"""You are a data analyst AI assistant helping a user explore their data sources for visualization.

Available Data Sources:
{chr(10).join(data_sources_info) if data_sources_info else 'No data sources connected yet. Suggest connecting Google Sheets first.'}

Help the user understand what data they have available and suggest appropriate chart types they could create."""
                except:
                    system_content = "You are a data analyst AI assistant. Help the user explore their data and create meaningful visualizations."
            else:
                system_content = f"You are a data analyst AI assistant. You are helping a user on the {request.context.get('page', 'charts')} page of a data analytics application."
            
            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": request.message}
            ]
        
        # Get AI response
        ai_response = await ai_service.chat_completion(messages)
        
        # Generate follow-up questions if chart data was used
        follow_up_questions = []
        if chart_data_used and request.chart_id:
            try:
                default_questions = chart_context_service.get_default_questions(chart_context)
                follow_up_questions = [q["text"] for q in default_questions[:3]]  # First 3 questions
            except:
                follow_up_questions = [
                    "What other insights can you provide?",
                    "Are there any patterns I should be aware of?",
                    "How can I improve this visualization?"
                ]
        
        return ChatResponse(
            response=ai_response.content,
            chart_data_used=chart_data_used,
            follow_up_questions=follow_up_questions,
            charts_referenced=charts_referenced,
            provider_used=ai_service.get_provider_name(),
            model_used=ai_response.model
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_message = str(e)
        if "LLM_API_KEY" in error_message or "api_key" in error_message.lower():
            raise HTTPException(status_code=500, detail="AI service not configured. Please check API credentials.")
        else:
            raise HTTPException(status_code=500, detail=f"Chat analysis error: {error_message}")

@app.get("/chat/default-questions", response_model=DefaultQuestionsResponse)
async def get_default_questions(
    context: str = "charts",
    chart_ids: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get context-aware default questions for the chat interface"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        chart_context_service = ChartContextService(db)
        all_questions = []
        
        # Parse chart IDs if provided
        parsed_chart_ids = []
        if chart_ids:
            try:
                parsed_chart_ids = [int(id.strip()) for id in chart_ids.split(',') if id.strip()]
            except ValueError:
                parsed_chart_ids = []
        
        # Get questions for specific charts
        if parsed_chart_ids:
            for chart_id in parsed_chart_ids[:3]:  # Limit to first 3 charts
                try:
                    chart_context = await chart_context_service.get_chart_context(chart_id)
                    questions = chart_context_service.get_default_questions(chart_context)
                    all_questions.extend(questions[:2])  # First 2 questions per chart
                except:
                    continue
        
        # Add context-aware general questions
        if not all_questions:
            if not parsed_chart_ids or len(parsed_chart_ids) == 0:
                # EMPTY STATE: No charts - focus on data exploration and getting started
                general_questions = [
                    DefaultQuestion(
                        text="What data sources do I have available to explore?",
                        category="exploration",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="Help me analyze my data before creating charts",
                        category="analysis",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="What types of visualizations work best for my data?",
                        category="recommendations",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="Suggest chart ideas based on my connected sheets",
                        category="suggestions",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="Walk me through creating my first chart",
                        category="guidance",
                        chart_specific=False
                    )
                ]
            else:
                # HAS CHARTS: General analysis questions
                general_questions = [
                    DefaultQuestion(
                        text="Compare insights across all my charts",
                        category="comparison",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="What story do my charts tell together?",
                        category="narrative",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="How can I improve my data visualizations?",
                        category="recommendations",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="Identify patterns across my data",
                        category="patterns",
                        chart_specific=False
                    ),
                    DefaultQuestion(
                        text="What additional charts would enhance my analysis?",
                        category="suggestions",
                        chart_specific=False
                    )
                ]
            all_questions.extend([q.__dict__ for q in general_questions])
        
        # Convert to response format and limit total questions
        response_questions = []
        for q in all_questions[:8]:  # Limit to 8 total questions
            if isinstance(q, dict):
                response_questions.append(DefaultQuestion(**q))
            else:
                response_questions.append(q)
        
        return DefaultQuestionsResponse(questions=response_questions)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting default questions: {str(e)}")

@app.get("/chat/providers")
async def get_ai_providers():
    """Get available AI providers and their models"""
    try:
        return {
            "current_provider": os.getenv('LLM_PROVIDER', 'openai'),
            "available_providers": AIServiceFactory.get_available_providers(),
            "default_models": AIServiceFactory.get_default_models()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting AI providers: {str(e)}")

@app.get("/projects/{project_id}/table-columns/{table_id}")
async def get_table_columns_endpoint(
    project_id: int,
    table_id: int,
    table_type: str,
    db: Session = Depends(get_db)
):
    """Get columns for a specific table"""
    print(f"DEBUG: get_table_columns_endpoint called with project_id={project_id}, table_id={table_id}, table_type={table_type}")
    try:
        # Check auth
        if 'default' not in user_credentials:
            print("DEBUG: No default user in credentials")
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        print(f"DEBUG: user_credentials = {user_credentials}")
        print(f"DEBUG: user_credentials['default'] = {user_credentials['default']}")
        
        # Create a user object with the authenticated user id
        user_data = user_credentials['default']
        user_id = user_data.get('user_id') or user_data.get('id') or 1
        current_user = type('User', (), {'id': user_id})()
        print(f"DEBUG: Created user with id: {current_user.id}")
        
        # Get columns using the unified helper function
        print(f"DEBUG: Fetching columns for table_id={table_id}, table_type={table_type}")
        columns = get_table_columns(table_id, table_type, current_user, db)
        print(f"DEBUG: Found columns: {columns}")
        
        if not columns:
            print(f"DEBUG: No columns found for table_id={table_id}, table_type={table_type}")
            raise HTTPException(
                status_code=404, 
                detail=f"Table not found or has no columns (type: {table_type}, id: {table_id})"
            )
        
        return {"columns": columns}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Exception in get_table_columns_endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test-endpoint")
async def test_endpoint():
    """Test endpoint to verify routing works"""
    print("DEBUG: Test endpoint called!")
    return {"message": "Test endpoint works"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8053)
