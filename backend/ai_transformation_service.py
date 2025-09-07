"""
AI-powered transformation service using OpenAI to generate pandas transformation code
"""

import os
import json
from typing import Dict, Any, List, Optional
import openai
from openai import OpenAI
import pandas as pd


class AITransformationService:
    """Service to generate transformation code using OpenAI"""

    def __init__(self, api_key: str = None):
        """Initialize OpenAI client with API key"""
        if api_key:
            self.client = OpenAI(api_key=api_key)
        else:
            # Fallback to environment variable
            self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    async def generate_transformation_code(
        self, user_prompt: str, sample_data: List[List[str]], columns: List[str]
    ) -> Dict[str, Any]:
        """
        Generate pandas transformation code based on user's natural language prompt

        Args:
            user_prompt: Natural language description of transformation
            sample_data: Sample data rows (first 5-10 rows)
            columns: Column names

        Returns:
            Dictionary with generated code, summary, and metadata
        """
        try:
            # Prepare data context for OpenAI
            data_preview = self._format_data_preview(sample_data, columns)

            # Create comprehensive prompt for code generation
            system_prompt = self._create_system_prompt()
            user_message = self._create_user_message(user_prompt, data_preview, columns)

            # Call OpenAI API
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.1,
                max_tokens=1000,
            )

            # Parse the response
            result = self._parse_openai_response(response.choices[0].message.content)

            return {
                "success": True,
                "code": result.get("code", ""),
                "summary": result.get("summary", ""),
                "explanation": result.get("explanation", ""),
                "input_columns": columns,
                "estimated_output_columns": result.get("output_columns", columns),
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "",
                "summary": "",
                "explanation": "",
            }

    def _format_data_preview(
        self, sample_data: List[List[str]], columns: List[str]
    ) -> str:
        """Format sample data as a readable table for OpenAI"""
        if not sample_data or not columns:
            return "No data available"

        # Create a simple table representation
        preview = "Data Preview:\n"
        preview += "Columns: " + ", ".join(columns) + "\n\n"

        # Add header
        preview += " | ".join(f"{col:<15}" for col in columns) + "\n"
        preview += "-" * (len(columns) * 17 - 2) + "\n"

        # Add sample rows (limit to first 5)
        for row in sample_data[:5]:
            # Ensure row has same length as columns
            padded_row = row + [""] * (len(columns) - len(row))
            row_str = " | ".join(
                f"{str(cell):<15}" for cell in padded_row[: len(columns)]
            )
            preview += row_str + "\n"

        return preview

    def _create_system_prompt(self) -> str:
        """Create system prompt for OpenAI"""
        return """You are an expert data transformation assistant. Your job is to generate Python pandas code based on natural language descriptions of data transformations.

IMPORTANT RULES:
1. Always assume the input DataFrame is called 'df'
2. Return the transformed DataFrame as 'df' (modify in place or reassign)
3. Only use pandas operations - no external libraries except pandas and numpy
4. Keep code concise and efficient
5. Handle potential errors gracefully
6. Return valid Python code that can be executed
7. Keep the column names the same as it is in the original df whenever possible. If adding new columns, follow the same naming convention that was used in the original df.

Response format - return ONLY a JSON object with these fields:
{
    "code": "# Python pandas code here",
    "summary": "One sentence summary of what the code does",
    "explanation": "Brief explanation of the transformation steps",
    "output_columns": ["list", "of", "expected", "column", "names", "after", "transformation"]
}

Examples of transformations:
- "delete xyz column" → df = df.drop('xyz', axis=1)
- "add column abc with sum of x and y" → df['abc'] = df['x'] + df['y']
- "filter rows where status is active" → df = df[df['status'] == 'active']
- "group by category and sum amounts" → df = df.groupby('category')['amount'].sum().reset_index()"""

    def _create_user_message(
        self, user_prompt: str, data_preview: str, columns: List[str]
    ) -> str:
        """Create user message with prompt and data context"""
        return f"""Please generate pandas transformation code for the following request:

USER REQUEST: "{user_prompt}"

{data_preview}

Available columns: {', '.join(columns)}

Generate the transformation code following the rules in the system prompt."""

    def _parse_openai_response(self, response_content: str) -> Dict[str, Any]:
        """Parse OpenAI response and extract code, summary, etc."""
        try:
            # Try to parse as JSON first
            if response_content.strip().startswith("{"):
                return json.loads(response_content)

            # If not JSON, try to extract code blocks
            lines = response_content.split("\n")
            code_lines = []
            in_code_block = False
            summary = ""

            for line in lines:
                if line.strip().startswith("```python") or line.strip().startswith(
                    "```"
                ):
                    in_code_block = True
                    continue
                elif line.strip() == "```" and in_code_block:
                    in_code_block = False
                    continue
                elif in_code_block:
                    code_lines.append(line)
                elif not summary and line.strip() and not line.startswith("#"):
                    summary = line.strip()

            return {
                "code": "\n".join(code_lines) if code_lines else response_content,
                "summary": summary or "Data transformation",
                "explanation": "Generated transformation based on user request",
                "output_columns": [],  # Will be determined during execution
            }

        except json.JSONDecodeError:
            # Fallback - return the raw response as code
            return {
                "code": response_content,
                "summary": "Custom transformation",
                "explanation": "Generated transformation code",
                "output_columns": [],
            }

    def validate_transformation_code(
        self, code: str, sample_df: pd.DataFrame = None
    ) -> Dict[str, Any]:
        """
        Validate transformation code by testing it on sample data

        Args:
            code: Generated pandas code
            sample_df: Sample DataFrame to test on

        Returns:
            Validation result with success/error info
        """
        try:
            if sample_df is None:
                # Create a minimal test DataFrame
                sample_df = pd.DataFrame({"col1": [1, 2, 3], "col2": ["a", "b", "c"]})

            # Create a copy for testing
            df = sample_df.copy()

            # Execute the code in a controlled environment
            exec_globals = {"df": df, "pd": pd, "numpy": __import__("numpy")}
            try:
                exec(code, exec_globals)
            except AttributeError as e:
                # Handle common case where generated code tries to call string methods on numeric types
                if 'zfill' in str(e) and 'float' in str(e):
                    raise Exception(f"Generated code error: Trying to use zfill() on a numeric value. "
                                  f"This usually happens when a column contains numbers but the code expects strings. "
                                  f"Try converting to string first: df['column'].astype(str).str.zfill(n). "
                                  f"Original error: {str(e)}")
                else:
                    raise e

            # Get the result
            result_df = exec_globals.get("df", df)

            return {
                "valid": True,
                "output_columns": result_df.columns.tolist(),
                "output_shape": result_df.shape,
                "sample_output": (
                    result_df.head().to_dict() if len(result_df) > 0 else {}
                ),
            }

        except Exception as e:
            return {"valid": False, "error": str(e), "error_type": type(e).__name__}


# Global instance - uses environment variable
ai_service = AITransformationService()
