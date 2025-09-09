from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class ChatRequest(BaseModel):
    message: str
    chart_id: Optional[int] = None
    context: Dict[str, Any] = {}


class ChatResponse(BaseModel):
    response: str
    chart_data_used: bool = False
    follow_up_questions: List[str] = []
    charts_referenced: List[int] = []
    provider_used: Optional[str] = None
    model_used: Optional[str] = None


class DefaultQuestionsRequest(BaseModel):
    context: str = "charts"
    chart_ids: List[int] = []


class DefaultQuestion(BaseModel):
    text: str
    category: str
    chart_specific: bool


class DefaultQuestionsResponse(BaseModel):
    questions: List[DefaultQuestion]