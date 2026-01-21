#!/bin/bash

echo "🚀 Starting DalgoLite..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if processes are already running
BACKEND_PID=$(ps aux | grep "python main.py" | grep -v grep | awk '{print $2}')
FRONTEND_PID=$(ps aux | grep "next dev" | grep -v grep | awk '{print $2}')

if [ ! -z "$BACKEND_PID" ]; then
    echo "⚠️  Backend already running on PID $BACKEND_PID"
else
    echo "📡 Starting backend server..."
    cd backend
    source venv/bin/activate && python main.py > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    echo "✅ Backend started on PID $BACKEND_PID (port 8000)"
    cd ..
fi

if [ ! -z "$FRONTEND_PID" ]; then
    echo "⚠️  Frontend already running on PID $FRONTEND_PID"
else
    echo "🎨 Starting frontend server..."
    cd frontend
    npm run dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "✅ Frontend started on PID $FRONTEND_PID (port 3000)"
    cd ..
fi

# Save PIDs for shutdown script
echo $BACKEND_PID > logs/backend.pid
echo $FRONTEND_PID > logs/frontend.pid

echo ""
echo "🎉 DalgoLite is now running!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "📋 API Docs: http://localhost:8000/docs"
echo ""
echo "📊 View logs:"
echo "   Backend: tail -f logs/backend.log"
echo "   Frontend: tail -f logs/frontend.log"
echo ""
echo "🛑 To stop: ./shutdown.sh"