#!/bin/bash

echo "📊 DalgoLite Status Check"
echo "========================="

# Check backend status
echo "🔧 Backend Server:"
BACKEND_PID=$(ps aux | grep "python main.py" | grep -v grep | awk '{print $2}')
if [ ! -z "$BACKEND_PID" ]; then
    echo "   ✅ Running (PID: $BACKEND_PID)"
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        echo "   ✅ Responding on http://localhost:8000"
    else
        echo "   ⚠️  Process running but not responding"
    fi
else
    echo "   ❌ Not running"
fi

# Check frontend status
echo ""
echo "🎨 Frontend Server:"
FRONTEND_PID=$(ps aux | grep "next dev" | grep -v grep | awk '{print $2}')
if [ ! -z "$FRONTEND_PID" ]; then
    echo "   ✅ Running (PID: $FRONTEND_PID)"
    if curl -s http://localhost:3000/ > /dev/null 2>&1; then
        echo "   ✅ Responding on http://localhost:3000"
    else
        echo "   ⚠️  Process running but not responding"
    fi
else
    echo "   ❌ Not running"
fi

# Check ports
echo ""
echo "🔌 Port Status:"
if lsof -i:8000 > /dev/null 2>&1; then
    PROCESS_8000=$(lsof -ti:8000 | head -1)
    echo "   Port 8000: ✅ In use by PID $PROCESS_8000"
else
    echo "   Port 8000: ❌ Available"
fi

if lsof -i:3000 > /dev/null 2>&1; then
    PROCESS_3000=$(lsof -ti:3000 | head -1)
    echo "   Port 3000: ✅ In use by PID $PROCESS_3000"
else
    echo "   Port 3000: ❌ Available"
fi

# Check log files
echo ""
echo "📋 Recent Logs:"
if [ -f "logs/backend.log" ]; then
    echo "   Backend: $(tail -1 logs/backend.log 2>/dev/null || echo 'No recent logs')"
else
    echo "   Backend: No log file found"
fi

if [ -f "logs/frontend.log" ]; then
    echo "   Frontend: $(tail -1 logs/frontend.log 2>/dev/null || echo 'No recent logs')"
else
    echo "   Frontend: No log file found"
fi

echo ""
echo "🔗 Quick Links:"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"