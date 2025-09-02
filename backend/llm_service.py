"""
Modular LLM service that supports multiple providers (Claude, OpenAI, etc.)
"""
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import json
from anthropic import Anthropic


class LLMProvider(ABC):
    """Abstract base class for LLM providers"""
    
    @abstractmethod
    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None, tools: Optional[list] = None) -> Dict[str, Any]:
        """Send a chat message and return response"""
        pass


class AnthropicProvider(LLMProvider):
    """Anthropic Claude provider"""
    
    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        self.client = Anthropic(api_key=api_key)
        self.model = model
    
    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None, tools: Optional[list] = None) -> Dict[str, Any]:
        system_prompt = """You are a friendly data analysis assistant. Provide clear, structured responses that are easy to scan.

RESPONSE FORMAT:
- Start with a brief, direct answer
- Use **bold** only for key numbers, insights, or section headers
- Use bullet points (•) for lists
- Keep paragraphs short (1-2 sentences max)
- Be conversational but concise
- End with a specific question or suggestion when appropriate

CONTENT FOCUS:
• Highlight the most important insight first
• Explain what the data shows in simple terms
• Point out any interesting patterns or outliers
• Suggest practical next steps
• Keep technical details minimal

EXAMPLE GOOD RESPONSE:
Your data shows **3 key patterns** worth exploring:

• **High engagement** in morning hours (9-11 AM)
• **Drop-off** occurs after lunch (2-4 PM)  
• **Weekend activity** is 40% lower than weekdays

The most actionable insight: Focus marketing efforts on morning timeframes for better results.

Want me to explore any specific time period in more detail?

AVAILABLE FUNCTIONS:
• **create_chart**: Create new charts when users request them
• **find_chart**: Look up existing charts by name to explain or analyze them

When users mention a specific chart name or ask about "the gender chart" etc., use find_chart first to get its details, then provide detailed analysis.

CHART CREATION:
Use create_chart with: chart_name, chart_type (bar/line/pie/scatter/histogram), x_axis_column, optional y_axis_column, aggregation_type (count/sum/avg/min/max/median)"""
        
        if context:
            system_prompt += f"\n\nContext about the current data:\n{json.dumps(context, indent=2)}"
        
        try:
            # Prepare API call parameters
            api_params = {
                "model": self.model,
                "max_tokens": 1000,
                "system": system_prompt,
                "messages": [{"role": "user", "content": message}]
            }
            
            # Add tools if provided
            if tools:
                api_params["tools"] = tools
            
            response = self.client.messages.create(**api_params)
            
            # Handle function calls if present
            if hasattr(response, 'stop_reason') and response.stop_reason == 'tool_use':
                # Extract text content from text blocks
                text_content = ""
                for block in response.content:
                    if hasattr(block, 'type') and block.type == 'text':
                        text_content += block.text
                
                return {
                    "type": "function_call",
                    "content": text_content,
                    "tool_calls": [block for block in response.content if hasattr(block, 'type') and block.type == 'tool_use']
                }
            else:
                return {
                    "type": "text",
                    "content": response.content[0].text if response.content else "No response"
                }
        except Exception as e:
            return {
                "type": "error",
                "content": f"Sorry, I encountered an error: {str(e)}"
            }


class OpenAIProvider(LLMProvider):
    """OpenAI GPT provider (placeholder for future implementation)"""
    
    def __init__(self, api_key: str, model: str = "gpt-4"):
        self.api_key = api_key
        self.model = model
    
    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None, tools: Optional[list] = None) -> Dict[str, Any]:
        # TODO: Implement OpenAI integration
        return {"type": "error", "content": "OpenAI provider not yet implemented"}


class LLMService:
    """Main LLM service that manages different providers"""
    
    def __init__(self):
        self.provider = None
        self._is_configured = False
        self._error_message = None
        self._configure_provider()
    
    def _configure_provider(self):
        """Configure the LLM provider, handling missing credentials gracefully"""
        try:
            provider_name = os.getenv("LLM_PROVIDER", "anthropic").lower()
            api_key = os.getenv("LLM_API_KEY")
            model = os.getenv("LLM_MODEL")
            
            if not api_key or api_key == "your_anthropic_api_key_here":
                self._error_message = "LLM service not configured. Please set LLM_API_KEY in environment variables."
                return
            
            if provider_name == "anthropic":
                self.provider = AnthropicProvider(api_key, model or "claude-3-5-sonnet-20241022")
            elif provider_name == "openai":
                self.provider = OpenAIProvider(api_key, model or "gpt-4")
            else:
                self._error_message = f"Unsupported LLM provider: {provider_name}"
                return
            
            self._is_configured = True
            
        except Exception as e:
            self._error_message = f"Failed to configure LLM service: {str(e)}"
    
    async def chat_with_context(self, message: str, context: Optional[Dict[str, Any]] = None, tools: Optional[list] = None) -> Dict[str, Any]:
        """Chat with the LLM using provided context"""
        if not self._is_configured:
            return {"type": "error", "content": f"Chat service unavailable: {self._error_message}"}
        
        if not self.provider:
            return {"type": "error", "content": "Chat service not properly initialized"}
        
        return await self.provider.chat(message, context, tools)
    
    def is_configured(self) -> bool:
        """Check if the LLM service is properly configured"""
        return self._is_configured


# Global LLM service instance
llm_service = LLMService()