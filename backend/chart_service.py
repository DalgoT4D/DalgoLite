"""
Chart creation service for LLM function calling
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from database import SavedChart, ChartRepository
import json


class ChartCreationService:
    """Service for creating charts via LLM function calls"""
    
    def __init__(self, db: Session):
        self.db = db
        self.chart_repo = ChartRepository(db)
    
    async def create_chart(self, 
                          chart_name: str,
                          chart_type: str,
                          x_axis_column: str,
                          sheet_id: Optional[int] = None,
                          project_id: Optional[int] = None,
                          y_axis_column: Optional[str] = None,
                          aggregation_type: str = "count") -> Dict[str, Any]:
        """Create a chart based on LLM recommendations"""
        
        try:
            # Validate required parameters
            if not chart_name or not chart_type or not x_axis_column:
                return {
                    "success": False,
                    "error": "Missing required parameters: chart_name, chart_type, x_axis_column"
                }
            
            if not sheet_id and not project_id:
                return {
                    "success": False,
                    "error": "Either sheet_id or project_id must be provided"
                }
            
            # Validate chart type
            valid_chart_types = ['bar', 'line', 'pie', 'scatter', 'histogram']
            if chart_type not in valid_chart_types:
                return {
                    "success": False,
                    "error": f"Invalid chart type. Must be one of: {', '.join(valid_chart_types)}"
                }
            
            # Validate aggregation type
            valid_aggregations = ['count', 'sum', 'avg', 'min', 'max', 'median']
            if aggregation_type not in valid_aggregations:
                aggregation_type = 'count'  # Default fallback
            
            # Create chart configuration
            chart_config = {
                "aggregation_type": aggregation_type
            }
            
            # Create the chart
            chart = SavedChart(
                chart_name=chart_name,
                chart_type=chart_type,
                x_axis_column=x_axis_column,
                y_axis_column=y_axis_column,
                chart_config=chart_config,
                sheet_id=sheet_id,
                project_id=project_id
            )
            
            self.db.add(chart)
            self.db.commit()
            self.db.refresh(chart)
            
            return {
                "success": True,
                "chart_id": chart.id,
                "message": f"✅ Created '{chart_name}' ({chart_type} chart) successfully!"
            }
            
        except Exception as e:
            self.db.rollback()
            return {
                "success": False,
                "error": f"Failed to create chart: {str(e)}"
            }


    async def find_chart_by_name(self, chart_name: str, sheet_id: Optional[int] = None, project_id: Optional[int] = None) -> Dict[str, Any]:
        """Find a chart by name and return its details"""
        try:
            query = self.db.query(SavedChart)
            
            # Filter by sheet or project
            if sheet_id:
                query = query.filter(SavedChart.sheet_id == sheet_id)
            elif project_id:
                query = query.filter(SavedChart.project_id == project_id)
            
            # Search by name (case insensitive partial match)
            charts = query.filter(SavedChart.chart_name.ilike(f"%{chart_name}%")).all()
            
            if not charts:
                return {
                    "success": False,
                    "error": f"No charts found matching '{chart_name}'"
                }
            
            # Return the first/best match
            chart = charts[0]
            
            return {
                "success": True,
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
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Error finding chart: {str(e)}"
            }


def get_chart_tools() -> list:
    """Get all available chart-related functions"""
    return [
        {
            "name": "create_chart",
            "description": "Create a new chart based on the available data columns",
            "input_schema": {
                "type": "object",
                "properties": {
                    "chart_name": {
                        "type": "string",
                        "description": "Name for the chart (e.g., 'Age Distribution', 'Revenue by Month')"
                    },
                    "chart_type": {
                        "type": "string",
                        "enum": ["bar", "line", "pie", "scatter", "histogram"],
                        "description": "Type of chart to create"
                    },
                    "x_axis_column": {
                        "type": "string",
                        "description": "Column name to use for X-axis"
                    },
                    "y_axis_column": {
                        "type": "string",
                        "description": "Column name to use for Y-axis (optional, leave empty for count aggregation)"
                    },
                    "aggregation_type": {
                        "type": "string",
                        "enum": ["count", "sum", "avg", "min", "max", "median"],
                        "description": "How to aggregate data when multiple rows have same X-axis value",
                        "default": "count"
                    }
                },
                "required": ["chart_name", "chart_type", "x_axis_column"]
            }
        },
        {
            "name": "find_chart",
            "description": "Find and get details about an existing chart by name",
            "input_schema": {
                "type": "object",
                "properties": {
                    "chart_name": {
                        "type": "string",
                        "description": "Name or partial name of the chart to find"
                    }
                },
                "required": ["chart_name"]
            }
        }
    ]