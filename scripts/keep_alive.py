import requests
from datetime import datetime, timezone


def hit_endpoint():
    url = "https://olaniyigeorge.com/api/notes"

    response = requests.get(url, timeout=30)

    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print(f"Status: {response.status_code}")
    print(f"Body: {response.text}")


if __name__ == "__main__":
    hit_endpoint()