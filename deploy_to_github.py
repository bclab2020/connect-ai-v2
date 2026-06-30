import os
import json
import base64
import urllib.request
import urllib.error
import sys

def upload_file_to_github(username, repo, token, file_path, repo_path, branch="main"):
    url = f"https://api.github.com/repos/{username}/{repo}/contents/{repo_path}"
    
    # Read file content and base64 encode it
    with open(file_path, "rb") as f:
        content = f.read()
    content_b64 = base64.b64encode(content).decode("utf-8")
    
    # First check if the file already exists to get its SHA (in case of updates)
    sha = None
    req = urllib.request.Request(url, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "antigravity-agent"
    })
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
            sha = data.get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"Error checking file {repo_path}: HTTP {e.code}")
            return False

    # Upload or update file
    body = {
        "message": f"Upload {repo_path} via CONNECT AI deployer",
        "content": content_b64,
        "branch": branch
    }
    if sha:
        body["sha"] = sha
        
    data_json = json.dumps(body).encode("utf-8")
    
    req = urllib.request.Request(url, data=data_json, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "antigravity-agent"
    }, method="PUT")
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status in [200, 201]:
                print(f"Successfully uploaded: {repo_path}")
                return True
    except urllib.error.HTTPError as e:
        print(f"Failed to upload {repo_path}: HTTP {e.code} - {e.read().decode('utf-8')}")
        return False
    return False

def enable_github_pages(username, repo, token, branch="main"):
    url = f"https://api.github.com/repos/{username}/{repo}/pages"
    
    # Setup GitHub Pages to serve from main branch root
    body = {
        "source": {
            "branch": branch,
            "path": "/"
        }
    }
    data_json = json.dumps(body).encode("utf-8")
    
    req = urllib.request.Request(url, data=data_json, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "antigravity-agent"
    }, method="POST")
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status in [201, 200, 204]:
                print("Successfully enabled GitHub Pages!")
                return True
    except urllib.error.HTTPError as e:
        # Check if Pages is already enabled (code 409 or message saying pages site already exists)
        err_msg = e.read().decode('utf-8')
        if e.code == 409 or "already exists" in err_msg:
            print("GitHub Pages is already enabled or in progress.")
            return True
        else:
            print(f"Failed to enable GitHub Pages: HTTP {e.code} - {err_msg}")
            return False
    return False

def main():
    if len(sys.argv) < 4:
        print("Usage: python deploy_to_github.py <username> <token> <repo>")
        sys.exit(1)
        
    username = sys.argv[1]
    token = sys.argv[2]
    repo = sys.argv[3]
    
    folder_path = os.path.dirname(os.path.abspath(__file__))
    
    files_to_upload = [
        "index.html",
        "style.css",
        "db.js",
        "biomechanics.js",
        "api.js",
        "app.js",
        "measurement.html",
        "portal.css",
        "portal.js",
        "mock_app.html",
        "face_analyzer.html",
        "sw.js",
        "manifest.json",
        "icon-192.png",
        "icon-512.png",
        "README.md"
    ]
    
    print(f"Starting deployment of CONNECT AI V2 to {username}/{repo}...")
    
    success_count = 0
    for f in files_to_upload:
        local_file = os.path.join(folder_path, f)
        if os.path.exists(local_file):
            if upload_file_to_github(username, repo, token, local_file, f):
                success_count += 1
        else:
            print(f"Local file missing: {f}")
            
    if success_count == len(files_to_upload):
        print("All files uploaded successfully!")
        print("Enabling GitHub Pages...")
        enable_github_pages(username, repo, token)
        print(f"\n🚀 Deployment complete! Your app should be live soon at:")
        print(f"👉 https://{username}.github.io/{repo}/")
    else:
        print(f"Deployment incomplete: only {success_count}/{len(files_to_upload)} files were uploaded.")

if __name__ == "__main__":
    main()
