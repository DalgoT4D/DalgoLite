#!/usr/bin/env python3
"""
Test script to validate the user flow implementation
Tests: New user signup, onboarding persistence, returning user
"""

import requests
import json
import time

BASE_URL = "http://localhost:8053"
FRONTEND_URL = "http://localhost:3053"

def test_health():
    """Test if backend is running"""
    print("1. Testing backend health...")
    response = requests.get(f"{BASE_URL}/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    print("   ✅ Backend is healthy")
    return True

def test_unauthenticated_status():
    """Test unauthenticated user status"""
    print("\n2. Testing unauthenticated status...")
    response = requests.get(f"{BASE_URL}/auth/status")
    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] == False
    print("   ✅ Unauthenticated status works correctly")
    return True

def test_onboarding_endpoints_require_auth():
    """Test that onboarding endpoints require authentication"""
    print("\n3. Testing onboarding endpoints require auth...")

    # Test get onboarding status
    response = requests.get(f"{BASE_URL}/api/user/onboarding-status")
    assert response.status_code == 401
    print("   ✅ GET onboarding-status requires auth")

    # Test update onboarding
    response = requests.post(
        f"{BASE_URL}/api/user/update-onboarding",
        json={"step": 1, "data": {"test": "data"}}
    )
    assert response.status_code == 401
    print("   ✅ POST update-onboarding requires auth")

    # Test complete onboarding
    response = requests.post(f"{BASE_URL}/api/user/complete-onboarding")
    assert response.status_code == 401
    print("   ✅ POST complete-onboarding requires auth")

    return True

def test_cors_headers():
    """Test CORS headers are properly configured"""
    print("\n4. Testing CORS configuration...")

    headers = {
        "Origin": FRONTEND_URL,
        "Referer": f"{FRONTEND_URL}/"
    }

    response = requests.get(f"{BASE_URL}/auth/status", headers=headers)
    assert response.status_code == 200

    # Check CORS headers in response
    assert "access-control-allow-origin" in response.headers or "Access-Control-Allow-Origin" in response.headers
    print("   ✅ CORS headers are properly configured")
    return True

def test_frontend_pages():
    """Test that frontend pages are accessible"""
    print("\n5. Testing frontend pages...")

    # Test main page
    response = requests.get(FRONTEND_URL)
    assert response.status_code == 200
    assert "DalgoLite" in response.text
    print("   ✅ Main page loads")

    # Test test-flow page
    response = requests.get(f"{FRONTEND_URL}/test-flow")
    assert response.status_code == 200
    assert "User Flow Test Page" in response.text or "test-flow" in response.text
    print("   ✅ Test flow page loads")

    # Test onboarding page
    response = requests.get(f"{FRONTEND_URL}/onboarding/onboarding_1")
    assert response.status_code == 200
    print("   ✅ Onboarding page loads")

    # Test home page
    response = requests.get(f"{FRONTEND_URL}/home")
    assert response.status_code == 200
    print("   ✅ Home page loads")

    return True

def main():
    print("=" * 50)
    print("DalgoLite User Flow Test Suite")
    print("=" * 50)

    try:
        # Run all tests
        test_health()
        test_unauthenticated_status()
        test_onboarding_endpoints_require_auth()
        test_cors_headers()
        test_frontend_pages()

        print("\n" + "=" * 50)
        print("✅ ALL TESTS PASSED!")
        print("=" * 50)
        print("\nNOTE: Manual testing required for:")
        print("- Google OAuth login flow (requires browser)")
        print("- New user registration flow")
        print("- Onboarding persistence")
        print("- Returning user detection")
        print("\nTo test manually:")
        print(f"1. Open {FRONTEND_URL}/test-flow")
        print("2. Click 'Sign In with Google'")
        print("3. Follow the onboarding flow")
        print("4. Test logout and login again to verify returning user")

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to servers. Make sure both backend and frontend are running.")
        print("   Run: ./startup.sh")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())