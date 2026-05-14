import urllib.request
import json

URL = "https://docuai-backend-64gk.onrender.com"
email = "xyz1@test.com"
password = "zxcvbn25"

req = urllib.request.Request(f"{URL}/api/v1/auth/login", data=json.dumps({"email": email, "password": password}).encode('utf-8'), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as response:
    token = json.loads(response.read())["access_token"]

req2 = urllib.request.Request(f"{URL}/api/v1/documents/", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req2) as response:
    print(response.read().decode('utf-8'))
