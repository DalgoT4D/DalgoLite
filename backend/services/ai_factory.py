import os
from typing import Optional
from .ai_service import AIService
from .openai_service import OpenAIService
from .anthropic_service import AnthropicService


class AIServiceFactory:
    """Factory to create AI service instances based on configuration"""
    
    @staticmethod
    def create_service(
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None
    ) -> AIService:
        """Create an AI service instance"""
        
        # Get configuration from environment if not provided
        provider = provider or os.getenv('LLM_PROVIDER', 'openai').lower()
        api_key = api_key or os.getenv('LLM_API_KEY')
        model = model or os.getenv('LLM_MODEL')
        
        if not api_key:
            raise ValueError("LLM_API_KEY environment variable is required")
        
        # Create service based on provider
        if provider == 'openai':
            return OpenAIService(api_key=api_key, model=model)
        elif provider == 'anthropic':
            return AnthropicService(api_key=api_key, model=model)
        else:
            raise ValueError(f"Unsupported AI provider: {provider}. Supported providers: openai, anthropic")
    
    @staticmethod
    def get_available_providers() -> list:
        """Get list of available AI providers"""
        return ['openai', 'anthropic']
    
    @staticmethod
    def get_default_models() -> dict:
        """Get default models for each provider"""
        return {
            'openai': 'gpt-4',
            'anthropic': 'claude-3-5-sonnet-20241022'
        }