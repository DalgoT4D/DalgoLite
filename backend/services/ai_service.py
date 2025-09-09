from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


@dataclass
class ChatMessage:
    role: str  # 'user', 'assistant', 'system'
    content: str


@dataclass
class ChatResponse:
    content: str
    usage: Optional[Dict[str, Any]] = None
    model: Optional[str] = None


class AIServiceError(Exception):
    """Base exception for AI service errors"""
    pass


class AIService(ABC):
    """Abstract base class for AI service providers"""
    
    def __init__(self, api_key: str, model: Optional[str] = None):
        self.api_key = api_key
        self.model = model or self.get_default_model()
    
    @abstractmethod
    def get_default_model(self) -> str:
        """Get the default model for this provider"""
        pass
    
    @abstractmethod
    async def chat_completion(
        self, 
        messages: List[ChatMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> ChatResponse:
        """Generate a chat completion"""
        pass
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """Get the name of this AI provider"""
        pass
    
    def format_chart_analysis_prompt(
        self,
        chart_data: Dict[str, Any],
        user_question: str,
        context: Dict[str, Any]
    ) -> List[ChatMessage]:
        """Format a prompt for chart data analysis"""
        
        chart_info = f"""
Chart Information:
- Name: {chart_data.get('chart_name', 'Unknown')}
- Type: {chart_data.get('chart_type', 'Unknown')}
- Data Source: {chart_data.get('source_name', 'Unknown')}
- X-Axis: {chart_data.get('x_axis_column', 'Unknown')}
- Y-Axis: {chart_data.get('y_axis_column', 'None')}
- Total Records: {chart_data.get('total_rows', 'Unknown')}
"""

        if 'sample_data' in chart_data and chart_data['sample_data']:
            chart_info += f"\nSample Data (first 10 rows):\n{chart_data['sample_data']}"
        
        if 'data_stats' in chart_data and chart_data['data_stats']:
            chart_info += f"\nData Statistics:\n{chart_data['data_stats']}"

        system_prompt = f"""You are a data analyst AI assistant specialized in analyzing charts and data visualizations. 
You have access to chart data and can provide insights, trends, and recommendations.

Context: You are analyzing data from the {context.get('page', 'charts')} page of a data analytics application.
Available charts on this page: {len(context.get('available_charts', []))} charts.

When analyzing data:
1. Provide clear, actionable insights
2. Identify trends, patterns, and anomalies
3. Suggest improvements or further analysis
4. Use business-friendly language
5. Be specific about the data you're referencing
"""

        user_prompt = f"{chart_info}\n\nUser Question: {user_question}\n\nPlease analyze this chart data and provide insights."

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_prompt)
        ]