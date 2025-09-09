#!/bin/bash

echo "📊 DalgoLite Production Status"
echo "=============================="

# Check backend
BACKEND_PID=$(ps aux | grep "uvicorn main:app" | grep -v grep | awk '{print $2}')
if [ ! -z "$BACKEND_PID" ]; then
    echo "🔧 Backend: ✅ Running (PID: $BACKEND_PID, Port: 8053)"
    echo "   📋 API Docs: http://localhost:8053/docs"
else
    echo "🔧 Backend: ❌ Not running"
fi

# Check frontend
FRONTEND_PID=$(ps aux | grep "next start" | grep -v grep | awk '{print $2}')
if [ ! -z "$FRONTEND_PID" ]; then
    echo "🎨 Frontend: ✅ Running (PID: $FRONTEND_PID, Port: 3053)"
    echo "   🌐 URL: http://localhost:3053"
else
    echo "🎨 Frontend: ❌ Not running"
fi

echo ""

# Check log files
if [ -f "logs/backend-prod.log" ]; then
    echo "📄 Backend logs available: logs/backend-prod.log"
    echo "   Last 3 lines:"
    tail -n 3 logs/backend-prod.log | sed 's/^/   /'
else
    echo "📄 No backend logs found"
fi

echo ""

if [ -f "logs/frontend-prod.log" ]; then
    echo "📄 Frontend logs available: logs/frontend-prod.log"
    echo "   Last 3 lines:"
    tail -n 3 logs/frontend-prod.log | sed 's/^/   /'
else
    echo "📄 No frontend logs found"
fi