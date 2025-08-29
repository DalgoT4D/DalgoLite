#!/bin/bash

echo "Setting up DalgoLite..."

# Create virtual environment for backend
echo "Creating Python virtual environment..."
python3 -m venv backend/venv
source backend/venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd frontend
npm install
cd ..

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a .env file in the backend directory based on .env.example"
echo "2. Set up Google OAuth credentials"
echo "3. Run './start.sh' to start both servers"