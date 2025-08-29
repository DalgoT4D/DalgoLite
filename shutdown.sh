#!/bin/bash

echo "🛑 Shutting down DalgoLite..."

# Function to kill process by PID file
kill_by_pid_file() {
    local pid_file=$1
    local service_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat $pid_file)
        if [ ! -z "$pid" ] && kill -0 $pid 2>/dev/null; then
            echo "🔥 Stopping $service_name (PID: $pid)"
            kill $pid
            sleep 2
            
            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                echo "⚡ Force killing $service_name"
                kill -9 $pid
            fi
            echo "✅ $service_name stopped"
        else
            echo "⚠️  $service_name was not running"
        fi
        rm -f $pid_file
    else
        echo "⚠️  No PID file found for $service_name"
    fi
}

# Kill processes by PID files
kill_by_pid_file "logs/backend.pid" "Backend server"
kill_by_pid_file "logs/frontend.pid" "Frontend server"

# Also kill any remaining processes by name
echo "🔍 Checking for any remaining processes..."

# Kill any remaining Python processes running main.py
BACKEND_PIDS=$(ps aux | grep "python main.py" | grep -v grep | awk '{print $2}')
if [ ! -z "$BACKEND_PIDS" ]; then
    echo "🔥 Killing remaining backend processes: $BACKEND_PIDS"
    echo $BACKEND_PIDS | xargs kill -9 2>/dev/null
fi

# Kill any remaining Next.js dev processes
FRONTEND_PIDS=$(ps aux | grep "next dev" | grep -v grep | awk '{print $2}')
if [ ! -z "$FRONTEND_PIDS" ]; then
    echo "🔥 Killing remaining frontend processes: $FRONTEND_PIDS"
    echo $FRONTEND_PIDS | xargs kill -9 2>/dev/null
fi

# Kill any Node processes on port 3000
NODE_PIDS=$(lsof -ti:3000)
if [ ! -z "$NODE_PIDS" ]; then
    echo "🔥 Killing processes on port 3000: $NODE_PIDS"
    echo $NODE_PIDS | xargs kill -9 2>/dev/null
fi

# Kill any Python processes on port 8000
PYTHON_PIDS=$(lsof -ti:8000)
if [ ! -z "$PYTHON_PIDS" ]; then
    echo "🔥 Killing processes on port 8000: $PYTHON_PIDS"
    echo $PYTHON_PIDS | xargs kill -9 2>/dev/null
fi

echo ""
echo "✅ DalgoLite shutdown complete!"
echo "📁 Logs preserved in logs/ directory"