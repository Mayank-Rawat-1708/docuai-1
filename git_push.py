import subprocess

def run(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(f"--- {cmd} ---")
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)

run("git add backend/app/api/documents.py")
run("git commit -m 'fix: resolve ImportError in documents.py by using correct document_service functions'")
run("git push")
