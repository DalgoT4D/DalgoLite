import anthropic
from typing import List, Optional
from .ai_service import AIService, ChatMessage, ChatResponse, AIServiceError


class AnthropicService(AIService):
    """Anthropic Claude service implementation"""
    
    def __init__(self, api_key: str, model: Optional[str] = None):
        super().__init__(api_key, model)
        self.client = anthropic.Anthropic(api_key=self.api_key)
    
    def get_default_model(self) -> str:
        return "claude-3-5-sonnet-20241022"
    
    def get_provider_name(self) -> str:
        return "anthropic"
    
    async def chat_completion(
        self, 
        messages: List[ChatMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> ChatResponse:
        """Generate a chat completion using Anthropic Claude"""
        try:
            # Separate system message from conversation messages
            system_message = ""
            conversation_messages = []
            
            for msg in messages:
                # Handle both ChatMessage objects and dictionaries
                if hasattr(msg, 'role'):  # ChatMessage object
                    role = msg.role
                    content = msg.content
                else:  # Dictionary
                    role = msg["role"]
                    content = msg["content"]
                
                if role == "system":
                    system_message = content
                else:
                    conversation_messages.append({
                        "role": role,
                        "content": content
                    })
            
            # Prepare API call parameters
            api_params = {
                "model": self.model,
                "messages": conversation_messages,
                "temperature": temperature,
                "max_tokens": max_tokens or 4000,
            }
            
            if system_message:
                api_params["system"] = system_message
            
            # Add any additional parameters
            api_params.update(kwargs)
            
            # Make the API call (Anthropic client is synchronous)
            response = self.client.messages.create(**api_params)
            
            return ChatResponse(
                content=response.content[0].text.strip(),
                usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                } if response.usage else None,
                model=response.model
            )
            
        except anthropic.AuthenticationError as e:
            raise AIServiceError(f"Anthropic authentication failed: {str(e)}")
        except anthropic.RateLimitError as e:
            raise AIServiceError(f"Anthropic rate limit exceeded: {str(e)}")
        except anthropic.APIError as e:
            raise AIServiceError(f"Anthropic API error: {str(e)}")
        except Exception as e:
            raise AIServiceError(f"Unexpected Anthropic error: {str(e)}")