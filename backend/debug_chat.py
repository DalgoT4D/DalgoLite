#!/usr/bin/env python3
"""Debug script to test the chart analysis pipeline"""

import asyncio
import sys
import os
import json
sys.path.append('.')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from services.chart_context import ChartContextService
from services.ai_factory import AIServiceFactory
from database import SessionLocal
from models.chat_models import ChatRequest

async def debug_chart_analysis():
    """Debug the complete chart analysis pipeline"""
    
    print("=== DEBUGGING CHART ANALYSIS PIPELINE ===")
    
    # Initialize services
    db = SessionLocal()
    try:
        chart_context_service = ChartContextService(db)
        ai_service = AIServiceFactory.create_service()
        
        # Test chart context retrieval
        print("\n1. Testing Chart Context Service...")
        chart_id = 90
        try:
            chart_context = await chart_context_service.get_chart_context(chart_id)
            print("✅ Chart context retrieved successfully:")
            print(json.dumps(chart_context, indent=2, default=str))
        except Exception as e:
            print(f"❌ Chart context error: {e}")
            return
        
        # Test AI prompt formatting
        print("\n2. Testing AI Prompt Formatting...")
        try:
            messages = ai_service.format_chart_analysis_prompt(
                chart_data=chart_context,
                user_question="What does this chart show about gender distribution?",
                context={"page": "charts"}
            )
            
            print("✅ AI messages formatted successfully:")
            for i, msg in enumerate(messages):
                print(f"Message {i}:")
                print(f"  Role: {msg.role}")
                print(f"  Content preview: {msg.content[:200]}...")
                print()
        except Exception as e:
            print(f"❌ AI formatting error: {e}")
            return
        
        # Test AI service call
        print("\n3. Testing AI Service Call...")
        try:
            ai_response = await ai_service.chat_completion(messages)
            print("✅ AI response received:")
            print(f"Content preview: {ai_response.content[:300]}...")
            print(f"Provider: {ai_service.get_provider_name()}")
            print(f"Model: {ai_response.model}")
        except Exception as e:
            print(f"❌ AI service error: {e}")
            import traceback
            traceback.print_exc()
            return
        
        print("\n=== PIPELINE TEST COMPLETE ===")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(debug_chart_analysis())