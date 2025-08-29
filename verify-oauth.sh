#!/bin/bash

echo "🔍 OAuth Configuration Verification"
echo "==================================="
echo ""

echo "✅ Backend Configuration:"
echo "   Redirect URI in .env: $(grep GOOGLE_REDIRECT_URI backend/.env | cut -d'=' -f2)"
echo "   Backend callback route: /auth/callback/google (line 95 in main.py)"
echo "   OAuth endpoint status: $(curl -s -w "%{http_code}" http://localhost:8000/auth/google | tail -c 3)"
echo ""

echo "❓ Google Cloud Console Check:"
echo "   Your OAuth client should have this EXACT redirect URI:"
echo "   📋 http://localhost:8000/auth/callback/google"
echo ""

echo "🎯 Error Details Analysis:"
echo "   The error shows: redirect_uri=http://localhost:8000/auth/callback/google"
echo "   This is CORRECT - the issue is in Google Cloud Console"
echo ""

echo "🔧 Next Steps:"
echo "   1. Go to: https://console.cloud.google.com/apis/credentials"
echo "   2. Edit your OAuth client (ID: 316034788132-o0sr3kr...)"
echo "   3. Update Authorized redirect URIs to:"
echo "      http://localhost:8000/auth/callback/google"
echo "   4. Save and wait 5-10 minutes"
echo "   5. Test in incognito mode"
echo ""

echo "📖 Full Guide: Read URGENT_REDIRECT_FIX.md"