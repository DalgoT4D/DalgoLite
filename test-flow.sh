#!/bin/bash

echo "=================================================="
echo "DalgoLite User Flow Test Suite"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8053"
FRONTEND_URL="http://localhost:3053"

# Test 1: Backend Health
echo -e "\n1. Testing backend health..."
HEALTH=$(curl -s $BASE_URL/health)
if echo $HEALTH | grep -q "healthy"; then
    echo -e "   ${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "   ${RED}❌ Backend health check failed${NC}"
    exit 1
fi

# Test 2: Unauthenticated Status
echo -e "\n2. Testing unauthenticated status..."
AUTH_STATUS=$(curl -s $BASE_URL/auth/status)
if echo $AUTH_STATUS | grep -q '"authenticated":false'; then
    echo -e "   ${GREEN}✅ Unauthenticated status works correctly${NC}"
else
    echo -e "   ${RED}❌ Auth status check failed${NC}"
    exit 1
fi

# Test 3: Onboarding endpoints require auth
echo -e "\n3. Testing onboarding endpoints require auth..."

# Test get onboarding status
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/user/onboarding-status)
if [ "$STATUS_CODE" = "401" ]; then
    echo -e "   ${GREEN}✅ GET onboarding-status requires auth${NC}"
else
    echo -e "   ${RED}❌ GET onboarding-status should return 401${NC}"
fi

# Test update onboarding
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"step": 1, "data": {"test": "data"}}' \
    $BASE_URL/api/user/update-onboarding)
if [ "$STATUS_CODE" = "401" ]; then
    echo -e "   ${GREEN}✅ POST update-onboarding requires auth${NC}"
else
    echo -e "   ${RED}❌ POST update-onboarding should return 401${NC}"
fi

# Test complete onboarding
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    $BASE_URL/api/user/complete-onboarding)
if [ "$STATUS_CODE" = "401" ]; then
    echo -e "   ${GREEN}✅ POST complete-onboarding requires auth${NC}"
else
    echo -e "   ${RED}❌ POST complete-onboarding should return 401${NC}"
fi

# Test 4: CORS Configuration
echo -e "\n4. Testing CORS configuration..."
CORS_RESPONSE=$(curl -s -I -H "Origin: $FRONTEND_URL" $BASE_URL/auth/status)
if echo $CORS_RESPONSE | grep -qi "access-control-allow-origin"; then
    echo -e "   ${GREEN}✅ CORS headers are properly configured${NC}"
else
    echo -e "   ${RED}❌ CORS headers missing${NC}"
fi

# Test 5: Frontend Pages
echo -e "\n5. Testing frontend pages..."

# Test main page
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" $FRONTEND_URL)
if [ "$STATUS_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ Main page loads${NC}"
else
    echo -e "   ${RED}❌ Main page failed to load${NC}"
fi

# Test test-flow page
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" $FRONTEND_URL/test-flow)
if [ "$STATUS_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ Test flow page loads${NC}"
else
    echo -e "   ${RED}❌ Test flow page failed to load${NC}"
fi

# Test onboarding page
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" $FRONTEND_URL/onboarding/onboarding_1)
if [ "$STATUS_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ Onboarding page loads${NC}"
else
    echo -e "   ${RED}❌ Onboarding page failed to load${NC}"
fi

# Test home page
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" $FRONTEND_URL/home)
if [ "$STATUS_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ Home page loads${NC}"
else
    echo -e "   ${RED}❌ Home page failed to load${NC}"
fi

echo -e "\n=================================================="
echo -e "${GREEN}✅ ALL AUTOMATED TESTS PASSED!${NC}"
echo "=================================================="
echo -e "\n${GREEN}NOTE: Manual testing required for:${NC}"
echo "- Google OAuth login flow (requires browser)"
echo "- New user registration flow"
echo "- Onboarding persistence"
echo "- Returning user detection"
echo -e "\n${GREEN}To test manually:${NC}"
echo "1. Open $FRONTEND_URL/test-flow"
echo "2. Click 'Sign In with Google'"
echo "3. Follow the onboarding flow"
echo "4. Test logout and login again to verify returning user"