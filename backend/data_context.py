"""
Data context generation for LLM chat functionality
"""
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from database import ConnectedSheet, SavedChart, TransformationProject
import pandas as pd
import json


class DataContextGenerator:
    """Generates rich context about data for LLM conversations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze_data_quality(self, data: List[List[Any]], columns: List[str]) -> Dict[str, Any]:
        """Analyze data quality metrics"""
        if not data or not columns:
            return {"error": "No data available for analysis"}
        
        try:
            # Convert to DataFrame for analysis
            df = pd.DataFrame(data[1:], columns=columns)  # Skip header row
            
            quality_metrics = {
                "total_rows": len(df),
                "total_columns": len(columns),
                "null_counts": {},
                "data_types": {},
                "unique_counts": {},
                "value_ranges": {}
            }
            
            for col in columns:
                if col in df.columns:
                    # Null counts
                    null_count = df[col].isnull().sum()
                    quality_metrics["null_counts"][col] = int(null_count)
                    
                    # Data types
                    quality_metrics["data_types"][col] = str(df[col].dtype)
                    
                    # Unique value counts
                    quality_metrics["unique_counts"][col] = int(df[col].nunique())
                    
                    # Value ranges for numeric columns
                    if pd.api.types.is_numeric_dtype(df[col]):
                        quality_metrics["value_ranges"][col] = {
                            "min": float(df[col].min()) if not df[col].isnull().all() else None,
                            "max": float(df[col].max()) if not df[col].isnull().all() else None,
                            "mean": float(df[col].mean()) if not df[col].isnull().all() else None
                        }
            
            return quality_metrics
        except Exception as e:
            return {"error": f"Error analyzing data quality: {str(e)}"}
    
    def get_chart_context(self, chart_id: int) -> Dict[str, Any]:
        """Generate context for a specific chart"""
        chart = self.db.query(SavedChart).filter(SavedChart.id == chart_id).first()
        if not chart:
            return {"error": "SavedChart not found"}
        
        context = {
            "chart": {
                "id": chart.id,
                "name": chart.chart_name,
                "type": chart.chart_type,
                "x_axis": chart.x_axis_column,
                "y_axis": chart.y_axis_column,
                "config": chart.chart_config,
                "created_at": chart.created_at.isoformat() if chart.created_at else None
            }
        }
        
        # Get sheet or project context
        if chart.sheet_id:
            sheet = self.db.query(ConnectedSheet).filter(ConnectedSheet.id == chart.sheet_id).first()
            if sheet:
                context["data_source"] = {
                    "type": "sheet",
                    "id": sheet.id,
                    "title": sheet.title,
                    "sheet_name": sheet.sheet_name,
                    "total_rows": sheet.total_rows,
                    "columns": sheet.columns,
                    "last_synced": sheet.last_synced.isoformat() if sheet.last_synced else None
                }
                
                # Add sample data and quality analysis
                if sheet.sample_data and sheet.columns:
                    context["sample_data"] = sheet.sample_data[:10]  # First 10 rows
                    context["data_quality"] = self.analyze_data_quality(sheet.sample_data, sheet.columns)
        
        elif chart.project_id:
            project = self.db.query(TransformationProject).filter(TransformationProject.id == chart.project_id).first()
            if project:
                context["data_source"] = {
                    "type": "project",
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "mode": project.mode,
                    "sheet_ids": project.sheet_ids,
                    "created_at": project.created_at.isoformat() if project.created_at else None
                }
                
                # Get information about source sheets
                source_sheets = []
                for sheet_id in project.sheet_ids:
                    sheet = self.db.query(ConnectedSheet).filter(ConnectedSheet.id == sheet_id).first()
                    if sheet:
                        source_sheets.append({
                            "id": sheet.id,
                            "title": sheet.title,
                            "sheet_name": sheet.sheet_name,
                            "columns": sheet.columns,
                            "total_rows": sheet.total_rows
                        })
                
                context["source_sheets"] = source_sheets
        
        return context
    
    def get_sheet_context(self, sheet_id: int) -> Dict[str, Any]:
        """Generate context for a specific sheet"""
        sheet = self.db.query(ConnectedSheet).filter(ConnectedSheet.id == sheet_id).first()
        if not sheet:
            return {"error": "Sheet not found"}
        
        context = {
            "sheet": {
                "id": sheet.id,
                "title": sheet.title,
                "sheet_name": sheet.sheet_name,
                "total_rows": sheet.total_rows,
                "columns": sheet.columns,
                "connected_at": sheet.connected_at.isoformat() if sheet.connected_at else None,
                "last_synced": sheet.last_synced.isoformat() if sheet.last_synced else None
            }
        }
        
        # Add sample data and quality analysis
        if sheet.sample_data and sheet.columns:
            context["sample_data"] = sheet.sample_data[:20]  # First 20 rows
            context["data_quality"] = self.analyze_data_quality(sheet.sample_data, sheet.columns)
        
        # Get charts for this sheet
        charts = self.db.query(SavedChart).filter(SavedChart.sheet_id == sheet_id).all()
        context["charts"] = [
            {
                "id": chart.id,
                "name": chart.chart_name,
                "type": chart.chart_type,
                "x_axis": chart.x_axis_column,
                "y_axis": chart.y_axis_column,
                "config": chart.chart_config
            }
            for chart in charts
        ]
        
        return context
    
    def get_project_context(self, project_id: int) -> Dict[str, Any]:
        """Generate context for a transformation project"""
        project = self.db.query(TransformationProject).filter(TransformationProject.id == project_id).first()
        if not project:
            return {"error": "Project not found"}
        
        context = {
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "mode": project.mode,
                "created_at": project.created_at.isoformat() if project.created_at else None
            }
        }
        
        # Get source sheets information
        source_sheets = []
        for sheet_id in project.sheet_ids:
            sheet = self.db.query(ConnectedSheet).filter(ConnectedSheet.id == sheet_id).first()
            if sheet:
                sheet_info = {
                    "id": sheet.id,
                    "title": sheet.title,
                    "sheet_name": sheet.sheet_name,
                    "columns": sheet.columns,
                    "total_rows": sheet.total_rows
                }
                
                # Add sample data for context
                if sheet.sample_data:
                    sheet_info["sample_data"] = sheet.sample_data[:5]  # First 5 rows per sheet
                
                source_sheets.append(sheet_info)
        
        context["source_sheets"] = source_sheets
        
        # Get charts for this project
        charts = self.db.query(SavedChart).filter(SavedChart.project_id == project_id).all()
        context["charts"] = [
            {
                "id": chart.id,
                "name": chart.chart_name,
                "type": chart.chart_type,
                "x_axis": chart.x_axis_column,
                "y_axis": chart.y_axis_column,
                "config": chart.chart_config
            }
            for chart in charts
        ]
        
        return context
    
    def generate_chat_context(self, 
                            chart_id: Optional[int] = None,
                            sheet_id: Optional[int] = None, 
                            project_id: Optional[int] = None) -> Dict[str, Any]:
        """Generate comprehensive context based on what the user is viewing"""
        context = {}
        
        if chart_id:
            context.update(self.get_chart_context(chart_id))
        elif sheet_id:
            context.update(self.get_sheet_context(sheet_id))
        elif project_id:
            context.update(self.get_project_context(project_id))
        
        return context