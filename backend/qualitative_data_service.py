"""
Qualitative Data Analysis Service using OpenAI to perform sentiment analysis and summarization
"""

import os
import json
from typing import Dict, Any, List, Optional
import openai
from openai import OpenAI
import pandas as pd
from tqdm import tqdm
from tenacity import retry, stop_after_attempt, wait_exponential


class QualitativeDataService:
    """Service to perform qualitative data analysis using OpenAI"""

    def __init__(self, api_key: str = None):
        """Initialize OpenAI client with API key"""
        if api_key:
            self.client = OpenAI(api_key=api_key)
        else:
            # Fallback to environment variable
            self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Hard-coded batch size as requested
        self.batch_size = 100  # summarization batches
        self.sentiment_batch_size = 10  # sentiment batches
        self.theme_batch_size = 10  # keep theme extraction batches very small to avoid truncation

    @retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=10))
    def chat_complete(self, system_prompt: str, user_prompt: str, model: str = "gpt-4o-mini") -> str:
        """Make a completion call to OpenAI with retry logic"""
        resp = self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return (resp.choices[0].message.content or "").strip()

    def call_llm_json_list(self, texts: List[str], system_msg: str, user_msg: str, model: str = "gpt-4o-mini") -> Any:
        """Call LLM with a list of texts and get JSON response"""
        instruction = (
            "Return ONLY valid JSON.\n\n"
            f"Here is the list of texts (JSON):\n{json.dumps(texts, ensure_ascii=False)}\n\n"
            + user_msg
        )
        raw = self.chat_complete(system_msg, instruction, model)
        
        # Clean the raw response
        raw = raw.strip()
        
        try:
            return json.loads(raw)
        except Exception as e:
            print(f"DEBUG: Initial JSON parsing failed: {str(e)}")
            print(f"DEBUG: Raw response length: {len(raw)}")
            print(f"DEBUG: Raw response preview: {repr(raw[:200])}...")
            
            # Try to extract JSON from response with improved regex patterns
            import re
            
            # Remove any markdown code blocks
            cleaned = re.sub(r'```json\s*', '', raw)
            cleaned = re.sub(r'```\s*$', '', cleaned)
            
            # Try to parse the cleaned version
            try:
                return json.loads(cleaned.strip())
            except Exception:
                pass
            
            # Find the most likely JSON content using improved patterns
            # Look for array patterns (for sentiment analysis)
            array_patterns = [
                r'\[(?:[^[\]]*|\[[^\]]*\])*\]',  # Nested array support
                r'\[.*?\]',  # Simple array
            ]
            
            for pattern in array_patterns:
                matches = re.findall(pattern, raw, re.DOTALL)
                for match in matches:
                    try:
                        result = json.loads(match.strip())
                        print(f"DEBUG: Successfully parsed with array pattern: {pattern}")
                        return result
                    except Exception:
                        continue
            
            # Look for object patterns (for summarization)
            object_patterns = [
                r'\{(?:[^{}]*|\{[^}]*\})*\}',  # Nested object support
                r'\{.*?\}',  # Simple object
            ]
            
            for pattern in object_patterns:
                matches = re.findall(pattern, raw, re.DOTALL)
                for match in matches:
                    try:
                        result = json.loads(match.strip())
                        print(f"DEBUG: Successfully parsed with object pattern: {pattern}")
                        return result
                    except Exception:
                        continue
            
            # Last resort: try to find JSON by locating start/end positions
            start = raw.find("[")
            end = raw.rfind("]")
            if start != -1 and end != -1 and end > start:
                try:
                    json_str = raw[start:end+1]
                    result = json.loads(json_str)
                    print(f"DEBUG: Successfully parsed with bracket extraction")
                    return result
                except Exception:
                    pass
            
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    json_str = raw[start:end+1]
                    result = json.loads(json_str)
                    print(f"DEBUG: Successfully parsed with brace extraction")
                    return result
                except Exception:
                    pass
            
            # If all else fails, provide comprehensive debug info
            print(f"DEBUG: All parsing attempts failed")
            print(f"DEBUG: Full raw response: {repr(raw)}")
            print(f"DEBUG: Original JSON error: {str(e)}")
            
            # Try to give a more helpful error message
            if "Extra data" in str(e):
                raise ValueError(f"OpenAI returned valid JSON followed by extra content. This usually indicates the model added explanatory text after the JSON. Response preview: {repr(raw[:200])}")
            else:
                raise ValueError(f"Model did not return valid JSON. Original error: {str(e)}. Response preview: {repr(raw[:200])}")

    def safe_json_parse(self, raw_response: str) -> dict:
        """Safely parse JSON from OpenAI response, handling common formatting issues"""
        
        print(f"DEBUG: safe_json_parse input (first 200 chars): '{raw_response[:200]}'")
        
        try:
            # Try direct JSON parsing first
            result = json.loads(raw_response.strip())
            print(f"DEBUG: Direct JSON parsing succeeded")
            return result
        except json.JSONDecodeError as e:
            print(f"DEBUG: Direct JSON parsing failed: {str(e)}")
            # Try to extract JSON from markdown code blocks
            raw = raw_response.strip()
            print(f"DEBUG: Attempting markdown cleanup on: '{raw[:100]}...'")
            
            # Remove markdown code block markers if present
            if raw.startswith("```json"):
                raw = raw[7:]
                print(f"DEBUG: Removed ```json prefix")
            elif raw.startswith("```"):
                raw = raw[3:]
                print(f"DEBUG: Removed ``` prefix")
            
            if raw.endswith("```"):
                raw = raw[:-3]
                print(f"DEBUG: Removed ``` suffix")
            
            # CRITICAL: Strip whitespace after markdown removal
            raw = raw.strip()
            print(f"DEBUG: After markdown cleanup and strip (first 200 chars): '{raw[:200]}'")
            
            # Try parsing cleaned content
            try:
                result = json.loads(raw)
                print(f"DEBUG: Markdown cleanup parsing succeeded")
                return result
            except json.JSONDecodeError:
                # Try to find JSON by bracket/brace extraction
                # First try array syntax
                start_array = raw.find("[")
                end_array = raw.rfind("]")
                if start_array != -1 and end_array != -1 and end_array > start_array:
                    try:
                        json_str = raw[start_array:end_array+1]
                        print(f"DEBUG: Trying array extraction: {json_str[:200]}...")
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        pass
                
                # Then try object syntax
                start_obj = raw.find("{")
                end_obj = raw.rfind("}")
                if start_obj != -1 and end_obj != -1 and end_obj > start_obj:
                    try:
                        json_str = raw[start_obj:end_obj+1]
                        print(f"DEBUG: Trying object extraction: {json_str[:200]}...")
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        pass
                
                # If all fails, return a basic structure
                print(f"ERROR: JSON parsing completely failed for response: '{raw_response[:200]}'")
                print(f"ERROR: JSON error was: {str(e)}")
                return {
                    "identified_theme": "Processing Error", 
                    "confidence_score": 0.1
                }

    async def analyze_qualitative_data(
        self, 
        df: pd.DataFrame, 
        text_column: str, 
        analysis_type: str,
        aggregation_column: Optional[str] = None,
        summarize_sentiment_analysis: bool = False,
        sentiment_column: Optional[str] = None,
        expected_themes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze qualitative data using OpenAI
        
        Args:
            df: DataFrame containing the data
            text_column: Column name containing qualitative text
            analysis_type: 'sentiment', 'summarization', or 'theme-extraction'
            aggregation_column: Optional column name for group-by analysis (summarization only)
            expected_themes: Optional comma-separated list of themes for theme extraction
            
        Returns:
            Dictionary with analysis results
        """
        try:
            if text_column not in df.columns:
                raise ValueError(f"Column '{text_column}' not found in data")
            
            print(f"DEBUG QualService: Input DataFrame shape: {df.shape}")
            print(f"DEBUG QualService: Text column '{text_column}' sample values: {df[text_column].head().tolist()}")
            
            # Filter out null/empty values before processing
            valid_mask = df[text_column].notna() & (df[text_column].astype(str).str.strip() != '')
            print(f"DEBUG QualService: Valid (non-empty) rows: {valid_mask.sum()} out of {len(df)}")
            
            if valid_mask.sum() == 0:
                raise ValueError(f"No valid text data found in column '{text_column}'. All values are null or empty.")
            
            # Use only rows with valid text data
            valid_df = df[valid_mask].copy()
            texts = valid_df[text_column].astype(str).tolist()
            
            print(f"DEBUG QualService: Processing {len(texts)} valid text entries")
            print(f"DEBUG QualService: Sample texts: {texts[:3]}")
            
            if analysis_type == "sentiment":
                return await self._perform_sentiment_analysis(valid_df, texts)
            elif analysis_type == "summarization":
                return await self._perform_summarization_analysis(valid_df, texts, aggregation_column, text_column, summarize_sentiment_analysis, sentiment_column)
            elif analysis_type == "theme-extraction":
                return await self._perform_theme_extraction_analysis(valid_df, texts, text_column, expected_themes)
            else:
                raise ValueError(f"Unknown analysis type: {analysis_type}")
                
        except Exception as e:
            print(f"DEBUG QualService: Error in analyze_qualitative_data: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "output_data": None,
                "summary_data": None
            }

    async def _perform_sentiment_analysis(self, df: pd.DataFrame, texts: List[str]) -> Dict[str, Any]:
        """Perform sentiment analysis on texts"""
        
        system_qa = (
            "You are a helpful data assistant for NGOs. Be concise, practical, and structured. "
            "CRITICAL: When asked for JSON, return ONLY valid JSON with no additional text, "
            "no explanations, no markdown formatting, and no commentary before or after the JSON."
        )

        prompt_sentiment = (
            "You are given a JSON list of texts. For each text, output exactly one item with:\n"
            "- 'label': one of ['Positive','Negative','Neutral']\n"
            "- 'confidence': a number between 0 and 1 (float)\n"
            "Return ONLY a JSON array with the same length and order as the inputs. No other text.\n\n"
            "Example input: [\"Great workshop\", \"Too fast\"]\n"
            "Example output: [{\"label\":\"Positive\",\"confidence\":0.92},{\"label\":\"Negative\",\"confidence\":0.73}]\n\n"
            "Response format: Start your response directly with [ and end with ]"
        )

        # Process in batches
        chunks = [texts[i:i+self.sentiment_batch_size] for i in range(0, len(texts), self.sentiment_batch_size)]
        sentiments = []
        
        print("🧠 Running sentiment analysis in batches...")
        for chunk in chunks:
            s = self.call_llm_json_list(chunk, system_qa, prompt_sentiment)

            # Ensure we have a list
            if not isinstance(s, list):
                print(f"DEBUG: Sentiment batch returned non-list; wrapping: {s}")
                s = [s]

            # If the model returned fewer/more items than the chunk, retry in smaller microbatches
            if len(s) != len(chunk):
                print(f"DEBUG: Sentiment batch size mismatch. Expected {len(chunk)}, got {len(s)}. Retrying with microbatches.")
                try:
                    micro_results = []
                    micro_size = 10
                    for start in range(0, len(chunk), micro_size):
                        micro_texts = chunk[start:start + micro_size]
                        micro_resp = self.call_llm_json_list(micro_texts, system_qa, prompt_sentiment)
                        if not isinstance(micro_resp, list):
                            micro_resp = [micro_resp]
                        micro_results.extend(micro_resp)
                    s = micro_results
                    print(f"DEBUG: Sentiment microbatch retry produced {len(s)} results.")
                except Exception as micro_err:
                    print(f"DEBUG: Sentiment microbatch retry failed: {micro_err}")

            # Final guard: pad/trim to match chunk length
            if len(s) < len(chunk):
                missing = len(chunk) - len(s)
                print(f"DEBUG: Padding {missing} missing sentiment results with neutral/low confidence.")
                s.extend([{"label": "Neutral", "confidence": 0.1}] * missing)
            elif len(s) > len(chunk):
                print(f"DEBUG: Truncating sentiment results from {len(s)} to {len(chunk)}")
                s = s[:len(chunk)]

            sentiments.extend(s)

        # Create output dataframe - add sentiment columns to original data
        out_df = df.copy()
        target_len = len(df)
        
        # Extract labels and confidence scores
        labels = [x.get('label', '') if isinstance(x, dict) else '' for x in sentiments]
        confidences = [x.get('confidence', 0.0) if isinstance(x, dict) else 0.0 for x in sentiments]
        
        # Ensure arrays match dataframe length
        labels = (labels + [''] * target_len)[:target_len]
        confidences = (confidences + [0.0] * target_len)[:target_len]
        
        out_df['sentiment_label'] = labels
        out_df['sentiment_confidence'] = confidences

        return {
            "success": True,
            "output_data": out_df,
            "analysis_type": "sentiment",
            "total_records": len(texts),
            "batch_count": len(chunks)
        }

    def _calculate_sentiment_stats(self, df: pd.DataFrame, sentiment_column: str, group_mask=None) -> Dict[str, Any]:
        """Calculate sentiment statistics for a dataframe or subset"""
        if group_mask is not None:
            subset_df = df[group_mask]
        else:
            subset_df = df
            
        if sentiment_column not in subset_df.columns:
            return {
                "total_positive_reviews": 0,
                "total_negative_reviews": 0,
                "percent_positive_reviews": 0.0,
                "percent_negative_reviews": 0.0
            }
        
        # Count sentiment values (handle case variations)
        sentiment_counts = subset_df[sentiment_column].str.lower().value_counts()
        
        total_positive = sentiment_counts.get('positive', 0)
        total_negative = sentiment_counts.get('negative', 0)
        total_reviews = len(subset_df)
        
        if total_reviews == 0:
            percent_positive = 0.0
            percent_negative = 0.0
        else:
            percent_positive = round((total_positive / total_reviews) * 100, 1)
            percent_negative = round((total_negative / total_reviews) * 100, 1)
        
        return {
            "total_positive_reviews": total_positive,
            "total_negative_reviews": total_negative,
            "percent_positive_reviews": percent_positive,
            "percent_negative_reviews": percent_negative
        }

    async def _perform_summarization_analysis(self, df: pd.DataFrame, texts: List[str], aggregation_column: Optional[str] = None, text_column: str = None, summarize_sentiment_analysis: bool = False, sentiment_column: Optional[str] = None) -> Dict[str, Any]:
        """Perform summarization analysis on texts"""
        
        system_qa = (
            "You are a helpful data assistant for NGOs. Be concise, practical, and structured. "
            "CRITICAL: When asked for JSON, return ONLY valid JSON with no additional text, "
            "no explanations, no markdown formatting, and no commentary before or after the JSON."
        )

        prompt_summary = (
            "You are given a JSON array of short feedback texts from multiple respondents. "
            "Do NOT summarize each item separately. Instead, write ONE thorough synthesis of the entire corpus. "
            "Use neutral, NGO-friendly language.\n\n"
            "Return ONLY valid JSON with this schema. No other text:\n"
            "{\n"
            '  "overall_summary": "<3–6 paragraphs that synthesize the whole set: overall tone; main positives; key pain points; notable divergences/outliers; and a brief conclusion>",\n'
            '  "bullet_highlights": ["3–8 crisp bullets capturing the most important takeaways"],\n'
            '  "suggested_actions": ["3–8 specific, practical next steps"],\n'
            '  "method_note": "One sentence on limitations (e.g., sample size, subjectivity)."\n'
            "}\n\n"
            "Guidelines:\n"
            "- Be evidence-based and concise.\n"
            "- Avoid copying long quotes; paraphrase.\n"
            "- If sentiment is mixed, say so and quantify approximately (e.g., \"roughly half\"), without inventing exact stats.\n\n"
            "Response format: Start your response directly with { and end with }"
        )

        # Check if we need to perform group-by analysis
        print(f"🔍 DEBUG AGGREGATION: aggregation_column={repr(aggregation_column)}")
        print(f"🔍 DEBUG AGGREGATION: is truthy={bool(aggregation_column)}")
        print(f"🔍 DEBUG AGGREGATION: df columns={list(df.columns)}")
        print(f"🔍 DEBUG AGGREGATION: in_df={aggregation_column in df.columns if aggregation_column else False}")
        
        # Clean up aggregation_column: treat empty strings as None
        if aggregation_column == "":
            aggregation_column = None
            
        if aggregation_column and aggregation_column.strip() and aggregation_column in df.columns:
            print(f"📝 Performing group-by summarization on column: {aggregation_column}")
            
            # Get unique values in the aggregation column
            unique_values = df[aggregation_column].dropna().unique()
            print(f"📝 Found {len(unique_values)} unique groups: {list(unique_values)}")
            
            summary_rows = []
            total_batches = 0
            
            for group_value in unique_values:
                # Get texts for this group
                group_mask = df[aggregation_column] == group_value
                group_df = df[group_mask]
                
                # Get the text column data for this group
                group_texts = group_df[text_column].astype(str).tolist()
                print(f"DEBUG: Group '{group_value}' has {len(group_texts)} texts: {group_texts[:3] if group_texts else []}")
                
                if not group_texts:
                    continue
                    
                print(f"📝 Analyzing group '{group_value}' with {len(group_texts)} texts...")
                
                # Generate summary for this group
                group_obj = self.call_llm_json_list(group_texts, system_qa, prompt_summary)
                if not isinstance(group_obj, dict):
                    print(f"DEBUG: Group summary returned non-dict; coercing: {group_obj}")
                    try:
                        group_obj = {} if group_obj is None else dict(group_obj)
                    except Exception:
                        group_obj = {}
                total_batches += 1
                
                # Create summary row for this group
                summary_row = {
                    aggregation_column: group_value,
                    "overall_summary": group_obj.get("overall_summary", ""),
                    "bullet_highlights": "; ".join(group_obj.get("bullet_highlights", [])),
                    "suggested_actions": "; ".join(group_obj.get("suggested_actions", [])),
                    "method_note": group_obj.get("method_note", "")
                }
                
                # Add sentiment statistics if enabled
                if summarize_sentiment_analysis and sentiment_column:
                    sentiment_stats = self._calculate_sentiment_stats(df, sentiment_column, group_mask)
                    summary_row.update(sentiment_stats)
                
                summary_rows.append(summary_row)
            
            # Create summary dataframe with aggregation column + 4 summary columns
            summary_df = pd.DataFrame(summary_rows)
            
            return {
                "success": True,
                "output_data": summary_df,
                "analysis_type": "summarization", 
                "total_records": len(texts),
                "batch_count": total_batches,
                "aggregation_info": {
                    "column": aggregation_column,
                    "groups": len(unique_values),
                    "group_values": list(unique_values)
                }
            }
        
        else:
            # Standard analysis without grouping - use hierarchical summarization for large datasets
            print("📝 Generating overall summary (corpus-wide analysis)...")
            
            # Implement hierarchical summarization for large datasets
            print(f"DEBUG: Summarization batch logic - texts: {len(texts)}, batch_size: {self.batch_size}")
            if len(texts) > self.batch_size:
                print(f"📝 Large dataset detected ({len(texts)} items > {self.batch_size}). Using hierarchical summarization...")
                hierarchical_result = self._hierarchical_summarization(texts, system_qa, prompt_summary)
                overall_obj = hierarchical_result["summary"]
                batch_count = hierarchical_result["batch_count"]
                print(f"DEBUG: Hierarchical batch_count from method: {batch_count}")
            else:
                print(f"📝 Small dataset ({len(texts)} items <= {self.batch_size}). Using single-pass summarization...")
                overall_obj = self.call_llm_json_list(texts, system_qa, prompt_summary)
                batch_count = 1
                print(f"DEBUG: Single-pass batch_count: {batch_count}")
            
            overall_summary_text = overall_obj.get("overall_summary", "")
            bullet_highlights = overall_obj.get("bullet_highlights", [])
            suggested_actions = overall_obj.get("suggested_actions", [])
            method_note = overall_obj.get("method_note", "")

            # Create summary dataframe with the 4 base columns
            summary_data = {
                "overall_summary": [overall_summary_text],
                "bullet_highlights": ["; ".join(bullet_highlights)],
                "suggested_actions": ["; ".join(suggested_actions)],
                "method_note": [method_note]
            }
            
            # Add sentiment statistics if enabled
            if summarize_sentiment_analysis and sentiment_column:
                sentiment_stats = self._calculate_sentiment_stats(df, sentiment_column)
                for key, value in sentiment_stats.items():
                    summary_data[key] = [value]
            
            summary_df = pd.DataFrame(summary_data)

            return {
                "success": True,
                "output_data": summary_df,
                "analysis_type": "summarization", 
                "total_records": len(texts),
                "batch_count": batch_count,
                "summary_details": {
                    "overall_summary": overall_summary_text,
                    "bullet_highlights": bullet_highlights,
                    "suggested_actions": suggested_actions,
                    "method_note": method_note
                }
            }

    def _hierarchical_summarization(self, texts: List[str], system_qa: str, prompt_summary: str) -> Dict[str, Any]:
        """
        Perform hierarchical summarization for large datasets:
        1. Split into batches
        2. Summarize each batch 
        3. Combine batch summaries into final summary
        """
        print(f"🔄 Starting hierarchical summarization for {len(texts)} items...")
        
        # Step 1: Split into batches and get batch summaries
        chunks = [texts[i:i+self.batch_size] for i in range(0, len(texts), self.batch_size)]
        print(f"🔄 Created {len(chunks)} batches of ~{self.batch_size} items each")
        
        batch_summaries = []
        
        # Create modified prompt for batch-level summarization
        batch_prompt = (
            "You are given a JSON array of feedback texts from respondents. "
            "Write ONE thorough synthesis of this batch. This will be combined with other batch summaries later. "
            "Use neutral, NGO-friendly language.\n\n"
            "Return ONLY valid JSON with this schema. No other text:\n"
            "{\n"
            '  "overall_summary": "<2-3 paragraphs synthesizing this batch: main themes, tone, key points>",\n'
            '  "bullet_highlights": ["4-6 key takeaways from this batch"],\n'
            '  "suggested_actions": ["3-5 specific actions based on this batch"],\n'
            '  "method_note": "Brief note on this batch characteristics."\n'
            "}\n\n"
            "Guidelines:\n"
            "- Focus on the most important themes in this batch.\n"
            "- Be concise but comprehensive.\n"
            "- Avoid copying long quotes; paraphrase.\n\n"
            "Response format: Start your response directly with { and end with }"
        )
        
        # Process each batch
        for i, chunk in enumerate(chunks):
            print(f"🔄 Processing batch {i+1}/{len(chunks)} ({len(chunk)} items)...")
            try:
                batch_result = self.call_llm_json_list(chunk, system_qa, batch_prompt)
                batch_summaries.append({
                    'batch_id': i + 1,
                    'item_count': len(chunk),
                    'summary': batch_result
                })
            except Exception as e:
                print(f"⚠️ Warning: Batch {i+1} failed with error: {str(e)}. Skipping...")
                continue
        
        print(f"🔄 Successfully processed {len(batch_summaries)} out of {len(chunks)} batches")
        
        # Step 2: Combine batch summaries into final summary
        if not batch_summaries:
            # Fallback if all batches failed
            print("⚠️ All batches failed. Using fallback summary...")
            return {
                "overall_summary": "Unable to generate comprehensive summary due to processing errors.",
                "bullet_highlights": ["Data processing encountered technical difficulties"],
                "suggested_actions": ["Review data quality and retry analysis"],
                "method_note": "Summary generation failed due to technical issues."
            }
        
        # Create meta-summary prompt
        meta_prompt = (
            "You are given a JSON array of batch summaries from a large dataset analysis. "
            "Each batch summary represents insights from a portion of the full dataset. "
            "Synthesize ALL batch summaries into ONE comprehensive final summary.\n\n"
            "Return ONLY valid JSON with this schema. No other text:\n"
            "{\n"
            '  "overall_summary": "<3-6 paragraphs synthesizing across ALL batches: overall patterns, main themes, key insights, notable variations>",\n'
            '  "bullet_highlights": ["6-10 most important takeaways from the complete dataset"],\n'
            '  "suggested_actions": ["6-10 specific, actionable next steps based on full analysis"],\n'
            '  "method_note": "Note on methodology and limitations of hierarchical analysis."\n'
            "}\n\n"
            "Guidelines:\n"
            "- Look for patterns ACROSS batches, not just within them.\n"
            "- Identify consensus themes vs. divergent views.\n"
            "- Prioritize insights that appear consistently across multiple batches.\n"
            "- Be comprehensive but avoid redundancy.\n\n"
            "Response format: Start your response directly with { and end with }"
        )
        
        # Extract batch summaries for meta-analysis
        batch_summary_texts = []
        for batch_info in batch_summaries:
            batch_data = batch_info['summary']
            summary_text = f"Batch {batch_info['batch_id']} ({batch_info['item_count']} items): {batch_data.get('overall_summary', '')}"
            batch_summary_texts.append(summary_text)
        
        print(f"🔄 Generating meta-summary from {len(batch_summary_texts)} batch summaries...")
        
        try:
            # Use call_llm_json_list with the batch summaries as input
            final_result = self.call_llm_json_list(batch_summary_texts, system_qa, meta_prompt)
            
            # Add methodology note about hierarchical processing
            if 'method_note' in final_result:
                original_note = final_result['method_note']
                final_result['method_note'] = f"Hierarchical analysis of {len(texts)} items in {len(chunks)} batches. {original_note}"
            
            print(f"✅ Hierarchical summarization completed successfully!")
            return {
                "summary": final_result,
                "batch_count": len(chunks)
            }
            
        except Exception as e:
            print(f"⚠️ Meta-summary generation failed: {str(e)}. Using consolidated fallback...")
            
            # Fallback: manually combine key points from batch summaries
            all_highlights = []
            all_actions = []
            
            for batch_info in batch_summaries:
                batch_data = batch_info['summary']
                if isinstance(batch_data.get('bullet_highlights'), list):
                    all_highlights.extend(batch_data['bullet_highlights'])
                if isinstance(batch_data.get('suggested_actions'), list):
                    all_actions.extend(batch_data['suggested_actions'])
            
            return {
                "summary": {
                    "overall_summary": f"Analysis of {len(texts)} items across {len(chunks)} batches revealed multiple themes. Due to processing limitations, detailed synthesis is unavailable, but key patterns were identified across batches.",
                    "bullet_highlights": all_highlights[:8],  # Limit to avoid overwhelming
                    "suggested_actions": all_actions[:8],
                    "method_note": f"Hierarchical analysis of {len(texts)} items in {len(chunks)} batches. Meta-summary generation encountered technical difficulties."
                },
                "batch_count": len(chunks)
            }

    async def _perform_theme_extraction_analysis(self, df: pd.DataFrame, texts: List[str], text_column: str, expected_themes: Optional[str] = None) -> Dict[str, Any]:
        """Perform theme extraction analysis on texts"""
        
        try:
            print(f"DEBUG: Starting theme extraction for {len(texts)} texts")
            print(f"DEBUG: Expected themes: {expected_themes}")
            
            # Parse expected themes from comma-separated string
            themes_list = []
            if expected_themes and expected_themes.strip():
                themes_list = [theme.strip() for theme in expected_themes.split(',') if theme.strip()]
                # Always include 'Others' as fallback category when specific themes provided
                if 'Others' not in themes_list:
                    themes_list.append('Others')
            else:
                # No themes provided - AI will auto-discover themes from the data
                print(f"DEBUG: No expected themes provided. AI will auto-discover themes from the text data.")
                themes_list = []  # Empty list triggers auto-discovery mode
            
            print(f"DEBUG: Using themes: {themes_list}")
            
            # Use batching for efficiency (like sentiment analysis)
            # Using same batch size as other operations for consistency
            results = []
            
            for i in range(0, len(texts), self.theme_batch_size):
                batch_texts = texts[i:i + self.theme_batch_size]
                batch_indices = list(range(i, min(i + self.theme_batch_size, len(texts))))
                
                try:
                    print(f"DEBUG: Processing batch {i//self.theme_batch_size + 1}, texts {i+1}-{min(i + self.theme_batch_size, len(texts))}")
                    
                    # Create batch prompt for theme classification
                    if len(themes_list) > 0:  # If we have specific themes
                        themes_str = ', '.join(f"'{t}'" for t in themes_list if t != 'Others')
                        print(f"DEBUG: themes_str for prompt: '{themes_str}'")
                        print(f"DEBUG: Full themes_list: {themes_list}")
                        system_prompt = f"""You are an expert at analyzing text and identifying themes.

Classify each text into one of these themes: {themes_str}, or 'Others' if none fit.

Return ONLY a JSON array with exactly {len(batch_texts)} objects, one per text in the same order, each containing:
- "identified_theme": one of the provided themes or "Others"
- "confidence_score": float between 0.0 and 1.0

Start your response with '[' and end with ']'. Do NOT use markdown/code fences, headings, or any text outside the JSON array.
Be decisive and use semantic meaning, not just keywords."""
                    else:  # Auto-discovery mode
                        system_prompt = f"""You are an expert at analyzing text and identifying themes.

Identify the main theme/topic in each text. Return ONLY a JSON array with exactly {len(batch_texts)} objects, one per text in the same order:
- "identified_theme": concise theme name (2-4 words max)
- "confidence_score": float between 0.0 and 1.0

Start your response with '[' and end with ']'. Do NOT use markdown/code fences, headings, or any text outside the JSON array.
Make theme names consistent and descriptive."""
                    
                    # Format batch texts for prompt
                    batch_prompt = "Texts to analyze:\n"
                    for j, text in enumerate(batch_texts):
                        batch_prompt += f"{j+1}. {text}\n"
                    
                    print(f"DEBUG: Full system prompt:\n{system_prompt}")
                    print(f"DEBUG: User prompt (first 500 chars): {batch_prompt[:500]}...")
                    
                    # Call OpenAI API for batch classification
                    response = self.client.chat.completions.create(
                        model="gpt-4o-mini",  # fastest available
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": batch_prompt}
                        ],
                        temperature=0.0,
                        max_tokens=12000  # allow larger outputs to avoid truncation
                    )
                    
                    # Parse batch response
                    raw_response = response.choices[0].message.content
                    print(f"DEBUG: Raw LLM response for batch (first 1000 chars): '{raw_response[:1000]}'")
                    print(f"DEBUG: Raw LLM response length: {len(raw_response) if raw_response else 0}")
                    
                    if not raw_response or raw_response.strip() == "":
                        print("ERROR: LLM returned empty response!")
                        # Create fallback results for the entire batch
                        batch_results = []
                        for k in range(len(batch_texts)):
                            batch_results.append({
                                "identified_theme": "Others",
                                "confidence_score": 0.1
                            })
                    else:
                        batch_results = self.safe_json_parse(raw_response)
                        
                        # Ensure we have a list
                        if not isinstance(batch_results, list):
                            print(f"DEBUG: Converting single result to list: {batch_results}")
                            batch_results = [batch_results]

                        # Fallback: if model returned fewer results than texts, retry in smaller chunks
                        if len(batch_results) != len(batch_texts):
                            print(f"DEBUG: Batch result count mismatch. Expected {len(batch_texts)}, got {len(batch_results)}. Retrying with smaller chunks.")
                            try:
                                fallback_results = []
                                microbatch_size = 10
                                for start in range(0, len(batch_texts), microbatch_size):
                                    sub_texts = batch_texts[start:start + microbatch_size]
                                    # Build a fresh system prompt for this sub-batch to match the exact count
                                    if len(themes_list) > 0:
                                        sub_system_prompt = f"""You are an expert at analyzing text and identifying themes.

Classify each text into one of these themes: {themes_str}, or 'Others' if none fit.

Return ONLY a JSON array with exactly {len(sub_texts)} objects, one per text in the same order, each containing:
- "identified_theme": one of the provided themes or "Others"
- "confidence_score": float between 0.0 and 1.0

Start your response with '[' and end with ']'. Do NOT use markdown/code fences, headings, or any text outside the JSON array.
Be decisive and use semantic meaning, not just keywords."""
                                    else:
                                        sub_system_prompt = f"""You are an expert at analyzing text and identifying themes.

Identify the main theme/topic in each text. Return ONLY a JSON array with exactly {len(sub_texts)} objects, one per text in the same order:
- "identified_theme": concise theme name (2-4 words max)
- "confidence_score": float between 0.0 and 1.0

Start your response with '[' and end with ']'. Do NOT use markdown/code fences, headings, or any text outside the JSON array.
Make theme names consistent and descriptive."""

                                    sub_prompt = "Texts to analyze:\n"
                                    for j_sub, text_sub in enumerate(sub_texts):
                                        sub_prompt += f"{j_sub+1}. {text_sub}\n"
                                    
                                    sub_response = self.client.chat.completions.create(
                                        model="gpt-4o-mini",
                                        messages=[
                                            {"role": "system", "content": sub_system_prompt},
                                            {"role": "user", "content": sub_prompt}
                                        ],
                                        temperature=0.0,
                                        max_tokens=4000
                                    )
                                    sub_raw = sub_response.choices[0].message.content
                                    parsed_sub = self.safe_json_parse(sub_raw)
                                    if not isinstance(parsed_sub, list):
                                        parsed_sub = [parsed_sub]
                                    fallback_results.extend(parsed_sub)
                                
                                batch_results = fallback_results
                                print(f"DEBUG: Fallback microbatching produced {len(batch_results)} results.")
                            except Exception as retry_error:
                                print(f"DEBUG: Microbatch retry failed: {retry_error}")

                        # Final guard: enforce one result per input text
                        if len(batch_results) < len(batch_texts):
                            missing = len(batch_texts) - len(batch_results)
                            print(f"DEBUG: Padding {missing} missing results with 'Others'")
                            batch_results.extend([{"identified_theme": "Others", "confidence_score": 0.1}] * missing)
                        elif len(batch_results) > len(batch_texts):
                            print(f"DEBUG: Truncating excess results from {len(batch_results)} to {len(batch_texts)}")
                            batch_results = batch_results[:len(batch_texts)]

                    print(f"DEBUG: Final batch_results count: {len(batch_results)}")
                    print(f"DEBUG: Sample batch_results: {batch_results[:2] if len(batch_results) > 0 else 'EMPTY'}")
                    
                    # Process batch results
                    for j, text in enumerate(batch_texts):
                        try:
                            # Get result for this text (with fallback if missing)
                            if j < len(batch_results):
                                result = batch_results[j]
                            else:
                                result = {"identified_theme": "Others", "confidence_score": 0.1}
                            
                            theme = result.get('identified_theme', 'Others')
                            confidence = float(result.get('confidence_score', 0.5))
                            
                            # Ensure theme is in our expected list (if we have specific themes)
                            if len(themes_list) > 0 and theme not in themes_list:
                                theme = 'Others'
                                confidence = max(0.1, confidence * 0.5)
                            
                            # Add to results
                            original_index = df.index[batch_indices[j]] if batch_indices[j] < len(df) else batch_indices[j]
                            results.append({
                                'row_id': original_index,
                                'original_text': text,
                                'identified_theme': theme,
                                'confidence_score': round(confidence, 3)
                            })
                            
                        except Exception as text_error:
                            print(f"DEBUG: Error processing batch text {j}: {str(text_error)}")
                            original_index = df.index[batch_indices[j]] if batch_indices[j] < len(df) else batch_indices[j]
                            results.append({
                                'row_id': original_index,
                                'original_text': text,
                                'identified_theme': 'Others',
                                'confidence_score': 0.1
                            })
                            
                except Exception as batch_error:
                    print(f"DEBUG: Error processing entire batch {i//self.batch_size + 1}: {str(batch_error)}")
                    # Add fallback results for entire batch
                    for j, text in enumerate(batch_texts):
                        original_index = df.index[batch_indices[j]] if batch_indices[j] < len(df) else batch_indices[j]
                        results.append({
                            'row_id': original_index,
                            'original_text': text,
                            'identified_theme': 'Others',
                            'confidence_score': 0.1
                        })

            # Create output DataFrame with required columns
            output_df = pd.DataFrame(results)
            
            # Add all original columns from the input DataFrame
            for col in df.columns:
                if col not in output_df.columns:
                    # Map original data to output based on row_id
                    output_df[col] = output_df['row_id'].apply(
                        lambda idx: df.loc[idx, col] if idx in df.index else None
                    )
            
            # Calculate summary statistics
            theme_counts = output_df['identified_theme'].value_counts().to_dict()
            avg_confidence = output_df['confidence_score'].mean()
            
            print(f"DEBUG: Theme extraction completed. Theme counts: {theme_counts}")
            
            # Calculate batch count for consistency with other analysis types
            batch_count = len(texts) // self.batch_size + (1 if len(texts) % self.batch_size > 0 else 0)
            
            return {
                "success": True,
                "output_data": output_df,  # Return DataFrame directly, not converted to dict
                "total_records": len(texts),
                "batch_count": batch_count,
                "summary_data": {
                    "total_processed": len(results),
                    "theme_distribution": theme_counts,
                    "average_confidence": round(avg_confidence, 3),
                    "themes_used": themes_list if len(themes_list) > 0 else "Auto-discovered themes",
                    "analysis_type": "Theme extraction with semantic classification"
                }
            }
            
        except Exception as e:
            print(f"DEBUG: Error in theme extraction: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "output_data": None,
                "summary_data": None
            }









# Global instance - initialized when needed
qualitative_service = None

def get_qualitative_service():
    """Get or create the global qualitative service instance"""
    global qualitative_service
    if qualitative_service is None:
        qualitative_service = QualitativeDataService()
    return qualitative_service
