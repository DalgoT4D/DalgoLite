import openai
from typing import List, Optional
from .ai_service import AIService, ChatMessage, ChatResponse, AIServiceError


class OpenAIService(AIService):
    """OpenAI GPT service implementation"""
    
    def __init__(self, api_key: str, model: Optional[str] = None):
        super().__init__(api_key, model)
        openai.api_key = self.api_key
    
    def get_default_model(self) -> str:
        return "gpt-4"
    
    def get_provider_name(self) -> str:
        return "openai"
    
    async def chat_completion(
        self, 
        messages: List[ChatMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> ChatResponse:
        """Generate a chat completion using OpenAI"""
        try:
            # Convert ChatMessage objects or dictionaries to OpenAI format
            openai_messages = []
            for msg in messages:
                if hasattr(msg, 'role'):  # ChatMessage object
                    openai_messages.append({"role": msg.role, "content": msg.content})
                else:  # Dictionary
                    openai_messages.append({"role": msg["role"], "content": msg["content"]})
            
            # Prepare API call parameters
            api_params = {
                "model": self.model,
                "messages": openai_messages,
                "temperature": temperature,
            }
            
            if max_tokens:
                api_params["max_tokens"] = max_tokens
            
            # Add any additional parameters
            api_params.update(kwargs)
            
            # Make the API call
            response = await openai.ChatCompletion.acreate(**api_params)
            
            return ChatResponse(
                content=response.choices[0].message.content.strip(),
                usage=response.usage.to_dict() if response.usage else None,
                model=response.model
            )
            
        except openai.error.AuthenticationError as e:
            raise AIServiceError(f"OpenAI authentication failed: {str(e)}")
        except openai.error.RateLimitError as e:
            raise AIServiceError(f"OpenAI rate limit exceeded: {str(e)}")
        except openai.error.APIError as e:
            raise AIServiceError(f"OpenAI API error: {str(e)}")
        except Exception as e:
            raise AIServiceError(f"Unexpected OpenAI error: {str(e)}")