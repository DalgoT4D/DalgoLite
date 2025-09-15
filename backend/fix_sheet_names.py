#!/usr/bin/env python3
"""
Fix Sheet1 issue by updating database records with actual sheet names from Google Sheets
"""

import sqlite3
import sys
import os
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_refreshed_credentials():
    """Get refreshed Google API credentials"""
    try:
        # Load credentials from the credentials file
        creds_file = 'credentials.json'
        if os.path.exists(creds_file):
            with open(creds_file, 'r') as f:
                creds_data = json.load(f)
                creds = Credentials.from_authorized_user_info(creds_data)
                
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                
            return creds
        return None
    except Exception as e:
        print(f"Error getting credentials: {e}")
        return None

def get_actual_sheet_name(spreadsheet_id, creds):
    """Get the actual first sheet name from a Google Spreadsheet"""
    try:
        service = build('sheets', 'v4', credentials=creds)
        spreadsheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        
        sheets = spreadsheet_metadata.get('sheets', [])
        if sheets:
            return sheets[0]['properties']['title']
        return 'Sheet1'  # fallback
    except Exception as e:
        print(f"Error getting sheet name for {spreadsheet_id}: {e}")
        return 'Sheet1'  # fallback

def fix_sheet_names():
    """Fix sheet names in the database"""
    
    # Get credentials
    creds = get_refreshed_credentials()
    if not creds:
        print("ERROR: Could not get valid credentials")
        return False
    
    # Connect to database
    try:
        conn = sqlite3.connect('dalgolite.db')
        cursor = conn.cursor()
        
        # Get all sheets with Sheet1 name
        cursor.execute("SELECT id, title, sheet_name, spreadsheet_id FROM connected_sheets WHERE sheet_name = 'Sheet1'")
        sheets = cursor.fetchall()
        
        if not sheets:
            print("No sheets found with 'Sheet1' name")
            return True
        
        print(f"Found {len(sheets)} sheets to update:")
        
        for sheet in sheets:
            sheet_id, title, current_name, spreadsheet_id = sheet
            print(f"  - ID: {sheet_id}, Title: {title}, Current Name: {current_name}")
            
            # Get actual sheet name from Google Sheets
            actual_name = get_actual_sheet_name(spreadsheet_id, creds)
            
            if actual_name != current_name:
                print(f"    Updating to: {actual_name}")
                
                # Update database record
                cursor.execute(
                    "UPDATE connected_sheets SET sheet_name = ? WHERE id = ?",
                    (actual_name, sheet_id)
                )
            else:
                print(f"    No change needed (actual name is also 'Sheet1')")
        
        # Commit changes
        conn.commit()
        
        # Verify updates
        cursor.execute("SELECT id, title, sheet_name FROM connected_sheets")
        updated_sheets = cursor.fetchall()
        
        print("\nUpdated sheet names:")
        for sheet in updated_sheets:
            sheet_id, title, name = sheet
            print(f"  - ID: {sheet_id}, Title: {title}, Sheet Name: {name}")
        
        conn.close()
        print("\nDatabase update completed successfully!")
        return True
        
    except Exception as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

if __name__ == "__main__":
    success = fix_sheet_names()
    sys.exit(0 if success else 1)