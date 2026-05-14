import requests
import sys

URL = "https://docuai-backend-64gk.onrender.com"
email = "xyz1@test.com"
password = "zxcvbn25"

# Login
r = requests.post(f"{URL}/api/v1/auth/login", json={"email": email, "password": password})
if r.status_code != 200:
    print("Login failed", r.text)
    sys.exit(1)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Upload
with open("dummy.pdf", "rb") as f:
    files = {"file": f}
    r = requests.post(f"{URL}/api/v1/documents/upload", headers=headers, files=files)
    if r.status_code != 200:
        print("Upload failed", r.text)
        sys.exit(1)
    
    doc_id = r.json().get("document", {}).get("id")
    print("Uploaded doc_id:", doc_id)

# Get
r = requests.get(f"{URL}/api/v1/documents/{doc_id}", headers=headers)
print("GET doc status code:", r.status_code)
print("GET doc response:", r.text)

import time
time.sleep(2)

# Get again
r = requests.get(f"{URL}/api/v1/documents/{doc_id}", headers=headers)
print("GET doc after 2s status code:", r.status_code)
print("GET doc after 2s response:", r.text)
