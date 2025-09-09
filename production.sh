#!/bin/bash

echo "🚀 Starting DalgoLite in Production Mode..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to handle Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Shutting down production servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup SIGINT

# Check if processes are already running
BACKEND_PID=$(ps aux | grep "uvicorn main:app" | grep -v grep | awk '{print $2}')
FRONTEND_PID=$(ps aux | grep "next start" | grep -v grep | awk '{print $2}')

if [ ! -z "$BACKEND_PID" ]; then
    echo "⚠️  Backend already running on PID $BACKEND_PID"
else
    echo "🏗️  Building and starting backend server..."
    cd backend
    source venv/bin/activate
    echo "✅ Virtual environment activated"
    
    # Start backend with uvicorn in background
    uvicorn main:app --host 0.0.0.0 --port 8053 > ../logs/backend-prod.log 2>&1 &
    BACKEND_PID=$!
    echo "✅ Backend started on PID $BACKEND_PID (port 8053)"
    cd ..
fi

if [ ! -z "$FRONTEND_PID" ]; then
    echo "⚠️  Frontend already running on PID $FRONTEND_PID"
else
    echo "🏗️  Building frontend..."
    cd frontend
    npm run build
    
    if [ $? -ne 0 ]; then
        echo "❌ Frontend build failed!"
        exit 1
    fi
    
    echo "🎨 Starting production frontend server..."
    npm run start > ../logs/frontend-prod.log 2>&1 &
    FRONTEND_PID=$!
    echo "✅ Frontend started on PID $FRONTEND_PID (port 3053)"
    cd ..
fi

# Save PIDs for shutdown script
echo $BACKEND_PID > logs/backend-prod.pid
echo $FRONTEND_PID > logs/frontend-prod.pid

echo ""
echo "🎉 DalgoLite Production Environment is running!"
echo "🌐 Frontend: http://localhost:3053"
echo "🔧 Backend API: http://localhost:8053"
echo "📋 API Docs: http://localhost:8053/docs"
echo ""
echo "📊 View logs:"
echo "   Backend: tail -f logs/backend-prod.log"
echo "   Frontend: tail -f logs/frontend-prod.log"
echo ""
echo "🛑 To stop: ./shutdown-prod.sh or Ctrl+C"

# Wait for both processes
wait