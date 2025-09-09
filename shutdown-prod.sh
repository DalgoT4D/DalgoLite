#!/bin/bash

echo "🛑 Shutting down DalgoLite production servers..."

# Read PIDs from files
if [ -f "logs/backend-prod.pid" ]; then
    BACKEND_PID=$(cat logs/backend-prod.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "🔧 Stopping backend server (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        echo "✅ Backend stopped"
    else
        echo "⚠️  Backend process not found"
    fi
    rm -f logs/backend-prod.pid
fi

if [ -f "logs/frontend-prod.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend-prod.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "🎨 Stopping frontend server (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
        echo "✅ Frontend stopped"
    else
        echo "⚠️  Frontend process not found"
    fi
    rm -f logs/frontend-prod.pid
fi

# Kill any remaining uvicorn or next processes
pkill -f "uvicorn main:app"
pkill -f "next start"

echo "🎉 All production servers stopped successfully!"