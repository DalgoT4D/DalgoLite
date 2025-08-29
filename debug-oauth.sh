#!/bin/bash

echo "🔍 DalgoLite OAuth Debug Tool"
echo "============================="
echo ""

# Check if .env file exists
echo "📁 Checking .env file..."
if [ -f "backend/.env" ]; then
    echo "✅ .env file found"
    
    # Check if required variables are set
    source backend/.env
    
    if [ -z "$GOOGLE_CLIENT_ID" ]; then
        echo "❌ GOOGLE_CLIENT_ID is not set in .env"
    else
        echo "✅ GOOGLE_CLIENT_ID is set (${GOOGLE_CLIENT_ID:0:20}...)"
    fi
    
    if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
        echo "❌ GOOGLE_CLIENT_SECRET is not set in .env"
    else
        echo "✅ GOOGLE_CLIENT_SECRET is set (${GOOGLE_CLIENT_SECRET:0:20}...)"
    fi
    
    if [ -z "$GOOGLE_REDIRECT_URI" ]; then
        echo "❌ GOOGLE_REDIRECT_URI is not set in .env"
    else
        echo "✅ GOOGLE_REDIRECT_URI: $GOOGLE_REDIRECT_URI"
    fi
else
    echo "❌ .env file not found in backend directory"
    echo "💡 Copy .env.example to .env and add your Google OAuth credentials"
fi

echo ""
echo "🌐 Testing Backend Connectivity..."

# Check if backend is running
if curl -s http://localhost:8000/ > /dev/null; then
    echo "✅ Backend is responding on port 8000"
    
    # Test OAuth endpoint
    oauth_response=$(curl -s -w "%{http_code}" http://localhost:8000/auth/google)
    http_code="${oauth_response: -3}"
    
    if [ "$http_code" = "307" ] || [ "$http_code" = "302" ]; then
        echo "✅ OAuth endpoint is working (redirect response: $http_code)"
    else
        echo "❌ OAuth endpoint error (HTTP $http_code)"
        echo "💡 Check backend logs: tail logs/backend.log"
    fi
else
    echo "❌ Backend is not responding"
    echo "💡 Start the backend: ./startup.sh"
fi

echo ""
echo "🎨 Testing Frontend Connectivity..."

# Check if frontend is running
if curl -s http://localhost:3000/ > /dev/null; then
    echo "✅ Frontend is responding on port 3000"
else
    echo "❌ Frontend is not responding"
    echo "💡 Start the frontend: ./startup.sh"
fi

echo ""
echo "🔧 Configuration Summary:"
echo "========================"
echo "Backend OAuth URL: http://localhost:8000/auth/google"
echo "Expected Redirect: http://localhost:8000/auth/callback/google"
echo "Frontend URL: http://localhost:3000"
echo ""
echo "📋 Next Steps:"
echo "1. Follow GOOGLE_OAUTH_SETUP.md for detailed setup"
echo "2. Ensure redirect URI in Google Cloud Console matches exactly:"
echo "   http://localhost:8000/auth/callback/google"
echo "3. Update backend/.env with your actual Google OAuth credentials"
echo "4. Restart servers: ./shutdown.sh && ./startup.sh"
echo ""
echo "🔍 For detailed logs:"
echo "   Backend: tail -f logs/backend.log"
echo "   Frontend: tail -f logs/frontend.log"