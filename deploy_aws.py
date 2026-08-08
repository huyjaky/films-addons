import subprocess
import json
import time

ECR = "266735814883.dkr.ecr.ap-southeast-1.amazonaws.com"
INSTANCE_ID = "i-02065971b24b80e3a"
REGION = "ap-southeast-1"

# Read local docker-compose.yml
with open("docker-compose.yml", "r") as f:
    compose_content = f.read()

# Replace image names and volume paths for AWS production environment
prod_compose = compose_content.replace(
    "image: phimapi-stremio-addon:latest",
    f"image: {ECR}/phimapi-stremio-addon:latest"
).replace(
    "image: torbox-cached-addon:latest",
    f"image: {ECR}/torbox-cached-addon:latest"
).replace(
    "/home/duckq1u/Documents/docker-volumes/aiostreams-volumes/postgres",
    "/opt/aiostreams/data/postgres"
).replace(
    "/home/duckq1u/Documents/docker-volumes/aiostreams-volumes/streamthru",
    "/opt/aiostreams/data/streamthru"
).replace(
    "/home/duckq1u/Documents/docker-volumes/aiostreams-volumes/aiostreams",
    "/opt/aiostreams/data/aiostreams"
)

# Escape single quotes for bash
escaped_compose = prod_compose.replace("'", "'\"'\"'")

remote_commands = [
    "cd /opt/aiostreams",
    f"aws ecr get-login-password --region {REGION} | docker login --username AWS --password-stdin {ECR}",
    f"docker pull {ECR}/torbox-cached-addon:latest",
    f"cat << 'EOF' > /opt/aiostreams/docker-compose.yml\n{prod_compose}\nEOF",
    "/usr/local/bin/docker-compose up -d --remove-orphans",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
]

print("Sending SSM send-command to AWS EC2 instance...")

cmd = [
    "conda", "run", "-n", "nuvio", "aws", "ssm", "send-command",
    "--instance-ids", INSTANCE_ID,
    "--document-name", "AWS-RunShellScript",
    "--comment", "Deploying updated docker-compose with torbox-cached-addon",
    "--parameters", f"commands={json.dumps(remote_commands)}",
    "--region", REGION,
    "--output", "json"
]

res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("SSM Send-Command Error:", res.stderr)
    exit(1)

res_json = json.loads(res.stdout)
command_id = res_json["Command"]["CommandId"]
print(f"Command sent successfully! Command ID: {command_id}")
print("Waiting for deployment to complete on EC2...")

for _ in range(30):
    time.sleep(4)
    out_cmd = [
        "conda", "run", "-n", "nuvio", "aws", "ssm", "get-command-invocation",
        "--command-id", command_id,
        "--instance-id", INSTANCE_ID,
        "--region", REGION,
        "--output", "json"
    ]
    out_res = subprocess.run(out_cmd, capture_output=True, text=True)
    if out_res.returncode == 0:
        inv = json.loads(out_res.stdout)
        status = inv.get("Status")
        print(f"Current Status: {status}")
        if status in ["Success", "Failed", "Cancelled", "TimedOut"]:
            print("\n--- Output ---")
            print(inv.get("StandardOutputContent"))
            if inv.get("StandardErrorContent"):
                print("--- Errors ---")
                print(inv.get("StandardErrorContent"))
            break

