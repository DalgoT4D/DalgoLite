from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import os
import json
import re
import pandas as pd
from dotenv import load_dotenv
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import create_tables, get_db, SheetRepository, ChartRepository, TransformationProjectRepository, ConnectedSheet, SavedChart, TransformationProject, TransformedDataWarehouse, PipelineExecutionHistory, engine
from pydantic import BaseModel
import hashlib
import asyncio
import sqlite3

load_dotenv()

# Create database tables
create_tables()

app = FastAPI(title="DalgoLite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    mode: str = 'simple'

class JoinAnalysisRequest(BaseModel):
    sheet_ids: List[int]

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
        include_granted_scopes='true'
    )
    
    return RedirectResponse(url=authorization_url)

@app.get("/auth/callback/google")
async def auth_callback(code: str, state: str = None):
    try:
        print(f"DEBUG: OAuth callback received code: {code[:20]}... state: {state}")
        
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
        
        print(f"DEBUG: Fetching token with code...")
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        print(f"DEBUG: Got credentials, storing...")
        
        # Store credentials (use proper session management in production)
        user_credentials['default'] = {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes
        }
        
        print(f"DEBUG: Credentials stored successfully. Keys: {list(user_credentials.keys())}")
        print(f"DEBUG: Scopes: {credentials.scopes}")
        
        # Redirect back to frontend
        return RedirectResponse(url="http://localhost:3000?connected=true")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/logout")
async def logout():
    """Clear user credentials and log out"""
    try:
        # Clear stored credentials
        user_credentials.clear()
        return {"message": "Logged out successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/auth/status")
async def auth_status():
    """Check if user is authenticated"""
    try:
        if 'default' not in user_credentials:
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
        
        return {"authenticated": True}
    except Exception as e:
        # If there's any error with credentials, consider user not authenticated
        user_credentials.clear()
        return {"authenticated": False}

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
async def analyze_sheet(sheet_data: Dict[str, Any], db: Session = Depends(get_db)):
    try:
        print(f"DEBUG: Received sheet_data: {sheet_data}")
        
        spreadsheet_input = sheet_data.get('spreadsheet_id')
        range_name = sheet_data.get('range', 'Sheet1!A:Z')
        
        print(f"DEBUG: spreadsheet_input: {spreadsheet_input}")
        print(f"DEBUG: range_name: {range_name}")
        
        if not spreadsheet_input:
            raise HTTPException(status_code=400, detail="Spreadsheet ID or URL is required")
        
        # Extract spreadsheet ID from URL or validate existing ID
        try:
            spreadsheet_id = extract_spreadsheet_id(spreadsheet_input)
            print(f"DEBUG: extracted spreadsheet_id: {spreadsheet_id}")
        except ValueError as e:
            print(f"DEBUG: ValueError in extract_spreadsheet_id: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        
        if 'default' not in user_credentials:
            print("DEBUG: Not authenticated - no credentials found")
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        print(f"DEBUG: Found credentials, building service...")
        creds = Credentials(**user_credentials['default'])
        service = build('sheets', 'v4', credentials=creds)
        
        # Get spreadsheet metadata for title
        try:
            spreadsheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            spreadsheet_title = spreadsheet_metadata.get('properties', {}).get('title', 'Untitled Sheet')
        except Exception as metadata_error:
            print(f"DEBUG: Failed to get spreadsheet metadata: {metadata_error}")
            # Try to get basic info from Drive API as fallback
            try:
                drive_service = build('drive', 'v3', credentials=creds)
                file_info = drive_service.files().get(fileId=spreadsheet_id, fields='name,mimeType').execute()
                spreadsheet_title = file_info.get('name', 'Unknown Sheet')
                mime_type = file_info.get('mimeType', '')
                print(f"DEBUG: Drive API file info - name: {spreadsheet_title}, mimeType: {mime_type}")
                
                if mime_type != 'application/vnd.google-apps.spreadsheet':
                    raise HTTPException(
                        status_code=400, 
                        detail=f"This file is not a Google Sheets document (found: {mime_type}). Please make sure you're connecting to a Google Sheets file, not an Excel or other file type."
                    )
            except Exception as drive_error:
                print(f"DEBUG: Drive API also failed: {drive_error}")
                raise HTTPException(
                    status_code=400, 
                    detail="Unable to access this document. Please ensure: 1) The link is for a Google Sheets file (not Excel), 2) The sheet is shared with appropriate permissions, 3) The sheet exists and is accessible."
                )
        
        # Get sheet data - try different range formats
        print(f"DEBUG: Calling Google Sheets API with ID: {spreadsheet_id}, range: {range_name}")
        sheet = service.spreadsheets()
        
        # Try multiple range formats in order of preference
        range_attempts = [
            range_name,  # Original range (Sheet1!A:Z)
            'A:Z',       # Without sheet name
            'A1:Z1000',  # Specific range
            '',          # Empty range (gets all data)
        ]
        
        result = None
        successful_range = None
        actual_sheet_name = 'Sheet1'
        
        for attempt_range in range_attempts:
            try:
                print(f"DEBUG: Trying range: '{attempt_range}'")
                if attempt_range:
                    result = sheet.values().get(spreadsheetId=spreadsheet_id, range=attempt_range).execute()
                else:
                    # Try to get spreadsheet metadata first to find the correct sheet name
                    sheets = spreadsheet_metadata.get('sheets', [])
                    if sheets:
                        actual_sheet_name = sheets[0]['properties']['title']
                        actual_range = f"{actual_sheet_name}!A:Z"
                        print(f"DEBUG: Found sheet name: '{actual_sheet_name}', trying range: '{actual_range}'")
                        result = sheet.values().get(spreadsheetId=spreadsheet_id, range=actual_range).execute()
                
                successful_range = attempt_range
                print(f"DEBUG: SUCCESS with range: '{successful_range}'")
                break
                
            except Exception as range_error:
                print(f"DEBUG: Range '{attempt_range}' failed: {range_error}")
                continue
        
        if result is None:
            raise HTTPException(status_code=400, detail="Unable to access sheet data. Please check if the sheet is publicly accessible.")
        
        values = result.get('values', [])
        
        if not values:
            raise HTTPException(status_code=400, detail="No data found in sheet")
        
        # Save to database
        sheet_repo = SheetRepository(db)
        columns = values[0] if values else []
        sample_data = values[:10]  # Store first 10 rows
        
        saved_sheet = sheet_repo.create_or_update_sheet(
            spreadsheet_id=spreadsheet_id,
            spreadsheet_url=spreadsheet_input,
            sheet_name=actual_sheet_name,
            title=spreadsheet_title,
            columns=columns,
            sample_data=sample_data,
            total_rows=len(values)
        )
        
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
        print(f"DEBUG: Exception in analyze_sheet: {type(e).__name__}: {e}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
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
async def get_connected_sheets(db: Session = Depends(get_db)):
    """Get all connected sheets from database"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
            
        sheet_repo = SheetRepository(db)
        sheets = sheet_repo.get_all_sheets()
        
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
async def get_sheet_details(sheet_id: int, db: Session = Depends(get_db)):
    """Get detailed information about a specific sheet"""
    try:
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id)
        
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
async def sync_sheet(sheet_id: int, db: Session = Depends(get_db)):
    """Re-sync a sheet with Google Sheets to get latest data"""
    try:
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id)
        
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
async def get_sheet_recommendations(sheet_id: int, db: Session = Depends(get_db)):
    """Get chart recommendations for a specific sheet"""
    try:
        sheet_repo = SheetRepository(db)
        sheet = sheet_repo.get_sheet_by_id(sheet_id)
        
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
async def resync_sheet_data(sheet_id: int, db: Session = Depends(get_db)):
    """Resync data from Google Sheets for an existing connected sheet"""
    try:
        sheet_repo = SheetRepository(db)
        existing_sheet = sheet_repo.get_sheet_by_id(sheet_id)
        
        if not existing_sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        # Check authentication
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated with Google")
        
        # Build the service with stored credentials
        creds = Credentials(**user_credentials['default'])
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
                    print(f"DEBUG: Trying range: '{attempt_range}'")
                    result = sheet.values().get(spreadsheetId=existing_sheet.spreadsheet_id, range=attempt_range).execute()
                    successful_range = attempt_range
                    print(f"DEBUG: SUCCESS with range: '{successful_range}'")
                    break
                except Exception as range_error:
                    print(f"DEBUG: Range '{attempt_range}' failed: {range_error}")
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
async def delete_sheet(sheet_id: int, db: Session = Depends(get_db)):
    """Delete a connected sheet and all its charts"""
    try:
        sheet_repo = SheetRepository(db)
        success = sheet_repo.delete_sheet(sheet_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        return {"message": "Sheet deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Chart endpoints
@app.get("/sheets/{sheet_id}/charts")
async def get_sheet_charts(sheet_id: int, db: Session = Depends(get_db)):
    """Get all charts for a specific sheet"""
    try:
        chart_repo = ChartRepository(db)
        charts = chart_repo.get_charts_by_sheet(sheet_id)
        
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
async def create_chart(chart_request: ChartCreateRequest, db: Session = Depends(get_db)):
    """Create a new chart"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.create_chart(
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
async def get_chart(chart_id: int, db: Session = Depends(get_db)):
    """Get a specific chart"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.get_chart_by_id(chart_id)
        
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
async def update_chart(chart_id: int, chart_request: ChartUpdateRequest, db: Session = Depends(get_db)):
    """Update an existing chart"""
    try:
        chart_repo = ChartRepository(db)
        chart = chart_repo.update_chart(
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
async def delete_chart(chart_id: int, db: Session = Depends(get_db)):
    """Delete a chart"""
    try:
        chart_repo = ChartRepository(db)
        success = chart_repo.delete_chart(chart_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Chart not found")
        
        return {"message": "Chart deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Transformation Project endpoints
@app.get("/projects")
async def get_projects(db: Session = Depends(get_db)):
    """Get all transformation projects"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
            
        project_repo = TransformationProjectRepository(db)
        projects = project_repo.get_all_projects()
        
        return {
            "projects": [
                {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "mode": project.mode,
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
async def create_project(project_request: ProjectCreateRequest, db: Session = Depends(get_db)):
    """Create a new transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Validate that all sheet IDs exist
        sheet_repo = SheetRepository(db)
        for sheet_id in project_request.sheet_ids:
            if not sheet_repo.get_sheet_by_id(sheet_id):
                raise HTTPException(status_code=400, detail=f"Sheet with ID {sheet_id} not found")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.create_project(
            name=project_request.name,
            description=project_request.description,
            sheet_ids=project_request.sheet_ids,
            mode=project_request.mode
        )
        
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "mode": project.mode,
            "sheet_ids": project.sheet_ids,
            "created_at": project.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}")
async def get_project(project_id: int, db: Session = Depends(get_db)):
    """Get a specific transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "mode": project.mode,
            "sheet_ids": project.sheet_ids,
            "join_config": project.join_config,
            "transformations": project.transformations,
            "pipeline_status": project.pipeline_status,
            "last_pipeline_run": project.last_pipeline_run.isoformat() if project.last_pipeline_run else None,
            "schedule_config": project.schedule_config,
            "warehouse_table_name": project.warehouse_table_name,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/analyze-join")
async def analyze_join_opportunities(request: JoinAnalysisRequest, db: Session = Depends(get_db)):
    """Analyze sheets for potential join opportunities"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        sheet_repo = SheetRepository(db)
        sheets_data = []
        
        # Get data for all requested sheets
        for sheet_id in request.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id)
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

def fetch_full_sheet_data(sheet: ConnectedSheet) -> pd.DataFrame:
    """Fetch complete data from Google Sheets for transformation"""
    try:
        creds = Credentials(**user_credentials['default'])
        service = build('sheets', 'v4', credentials=creds)
        
        # Use the same range detection logic as analyze_sheet
        range_attempts = [
            f"{sheet.sheet_name}!A:Z",  # Try with sheet name first
            'A:Z',                      # Without sheet name  
            'A1:Z1000',                 # Specific range
        ]
        
        result = None
        for attempt_range in range_attempts:
            try:
                print(f"DEBUG: Trying range for transform: '{attempt_range}'")
                result = service.spreadsheets().values().get(
                    spreadsheetId=sheet.spreadsheet_id, 
                    range=attempt_range
                ).execute()
                print(f"DEBUG: SUCCESS with range: '{attempt_range}'")
                break
            except Exception as range_error:
                print(f"DEBUG: Range '{attempt_range}' failed: {range_error}")
                continue
        
        if result is None:
            print(f"Error: Could not fetch data for sheet {sheet.title}")
            return pd.DataFrame()
        
        values = result.get('values', [])
        if not values or len(values) < 2:
            return pd.DataFrame()
        
        # Convert to pandas DataFrame
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
        print(f"Error fetching sheet data: {e}")
        return pd.DataFrame()

@app.post("/projects/{project_id}/preview-join")
async def preview_join(project_id: int, join_config: Dict[str, Any], db: Session = Depends(get_db)):
    """Preview the result of joining sheets with specified configuration"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get sheets data
        sheet_repo = SheetRepository(db)
        dataframes = {}
        sheets_data = {}
        
        for sheet_id in project.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id)
            if sheet:
                df = fetch_full_sheet_data(sheet)
                dataframes[sheet_id] = df
                sheets_data[sheet_id] = {"title": sheet.title}
        
        if len(dataframes) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 sheets to join")
        
        # Handle different modes
        mode = join_config.get('mode', project.mode)
        
        if mode == 'expert':
            # Expert mode: Execute custom SQL query
            custom_query = join_config.get('custom_query', '')
            if not custom_query:
                raise HTTPException(status_code=400, detail="Custom query required for expert mode")
            
            # For now, return placeholder data for expert mode
            # TODO: Implement SQL query execution engine
            return {
                "total_rows": 100,
                "preview_data": [
                    ["Result from custom query"],
                    ["Custom SQL execution not yet implemented"],
                    ["Please use Simple or Advanced mode"]
                ],
                "columns": ["Custom Query Result"],
                "join_stats": {
                    "left_rows": 0,
                    "right_rows": 0,
                    "joined_rows": 100,
                    "join_type": "custom_sql"
                }
            }
        
        # Advanced and Simple mode: Perform join based on configuration
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

# Project Charts endpoints
@app.get("/projects/{project_id}/charts")
async def get_project_charts(project_id: int, db: Session = Depends(get_db)):
    """Get charts for a transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get charts associated with this project
        chart_repo = ChartRepository(db)
        charts = db.query(SavedChart).filter(SavedChart.project_id == project_id).all()
        
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
async def get_project_chart_recommendations(project_id: int, db: Session = Depends(get_db)):
    """Get chart recommendations for a transformation project based on joined data"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get the columns from the joined data by simulating a join
        # For now, we'll get columns from all sheets and provide basic recommendations
        sheet_repo = SheetRepository(db)
        all_columns = set()
        
        for sheet_id in project.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id)
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
    mode: Optional[str] = None
    sheet_ids: Optional[List[int]] = None
    join_config: Optional[Dict[str, Any]] = None
    transformations: Optional[List[Dict[str, Any]]] = None
    schedule_config: Optional[Dict[str, Any]] = None

@app.put("/projects/{project_id}")
async def update_project(project_id: int, update_request: ProjectUpdateRequest, db: Session = Depends(get_db)):
    """Update a transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update only the fields that were provided
        update_data = {k: v for k, v in update_request.model_dump().items() if v is not None}
        updated_project = project_repo.update_project(project_id, **update_data)
        
        # If join_config or transformations changed, trigger pipeline execution
        if 'join_config' in update_data or 'transformations' in update_data:
            import asyncio
            asyncio.create_task(execute_transformation_pipeline(project_id, db))
        
        return {
            "id": updated_project.id,
            "name": updated_project.name,
            "description": updated_project.description,
            "mode": updated_project.mode,
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

@app.delete("/projects/{project_id}")
async def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a transformation project and all associated data"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Delete project charts (cascade handled by database relationship)
        chart_repo = ChartRepository(db)
        project_charts = db.query(SavedChart).filter(SavedChart.project_id == project_id).all()
        for chart in project_charts:
            chart_repo.delete_chart(chart.id)
        
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
        success = project_repo.delete_project(project_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete project")
        
        return {"message": "Project and all associated data deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Pipeline orchestration functions
async def execute_transformation_pipeline(project_id: int, db: Session):
    """Execute the transformation pipeline for a project"""
    from datetime import datetime, timezone
    
    start_time = datetime.now(timezone.utc)
    history_entry = None
    
    try:
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
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
        transformed_data = await process_transformation(project, sheet_repo)
        
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
        
        creds = Credentials(**user_credentials['default'])
        service = build('sheets', 'v4', credentials=creds)
        
        synced_count = 0
        total_sheets = len(project.sheet_ids)
        
        for sheet_id in project.sheet_ids:
            try:
                existing_sheet = sheet_repo.get_sheet_by_id(sheet_id)
                
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

async def process_transformation(project: TransformationProject, sheet_repo: SheetRepository):
    """Process data transformation based on project configuration"""
    try:
        # Get all sheet data for the project
        dataframes = {}
        for sheet_id in project.sheet_ids:
            sheet = sheet_repo.get_sheet_by_id(sheet_id)
            if sheet:
                df = fetch_full_sheet_data(sheet)
                dataframes[sheet_id] = df
        
        if len(dataframes) < 2:
            return None
        
        # Apply transformation based on mode
        if project.mode == 'expert':
            # TODO: Implement custom SQL execution
            # For now, return None to indicate not implemented
            return None
        
        # Simple and Advanced mode transformations
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
        
        # Apply transformations if in advanced mode
        if project.mode == 'advanced' and project.transformations:
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
        asyncio.create_task(execute_transformation_pipeline(project_id, db))
        
        return {"message": "Pipeline execution started", "project_id": project_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/{project_id}/charts")
async def create_project_chart(project_id: int, chart_request: ProjectChartCreateRequest, db: Session = Depends(get_db)):
    """Create a new chart for a transformation project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
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

@app.get("/projects/{project_id}/data")
async def get_project_data(project_id: int, db: Session = Depends(get_db)):
    """Get transformed data from warehouse for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
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
async def get_project_pipeline_history(project_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """Get pipeline execution history for a project"""
    try:
        if 'default' not in user_credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        project_repo = TransformationProjectRepository(db)
        project = project_repo.get_project_by_id(project_id)
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)