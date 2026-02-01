extraction prompt:

from openai import OpenAI

client = OpenAI(
  base_url="https://api.keywordsai.co/api/",
  api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",  # This will be overridden by prompt config
    messages=[{"role": "user", "content": "placeholder"}],  # This will be overridden
    extra_body={
      "prompt": {
        "prompt_id": "880547ac767343f88b93cbb1855a3eba",
        "variables": {
            "raw_notes": ""
        },
        "override": True
      }
    }
)

print(response.choices[0].message.content)





filtering prompt:
from openai import OpenAI

client = OpenAI(
  base_url="https://api.keywordsai.co/api/",
  api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",  # This will be overridden by prompt config
    messages=[{"role": "user", "content": "placeholder"}],  # This will be overridden
    extra_body={
      "prompt": {
        "prompt_id": "9a28291ec37f42c9a6affd2e73a0f185",
        "variables": {
            "complaint": "",
            "history_json": ""
        },
        "override": True
      }
    }
)

print(response.choices[0].message.content)



reasoning prompt:

from openai import OpenAI

client = OpenAI(
  base_url="https://api.keywordsai.co/api/",
  api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",  # This will be overridden by prompt config
    messages=[{"role": "user", "content": "placeholder"}],  # This will be overridden
    extra_body={
      "prompt": {
        "prompt_id": "ff0d70eae958476fa4b3a9d864e522a7",
        "variables": {
            "complaint": "",
            "filtered_data": ""
        },
        "override": True
      }
    }
)

print(response.choices[0].message.content)



synthesis prompt:
from openai import OpenAI

client = OpenAI(
  base_url="https://api.keywordsai.co/api/",
  api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",  # This will be overridden by prompt config
    messages=[{"role": "user", "content": "placeholder"}],  # This will be overridden
    extra_body={
      "prompt": {
        "prompt_id": "6376e45997634eac9baf6ebdd47b375c",
        "variables": {
            "reasoning_chain": ""
        },
        "override": True
      }
    }
)

print(response.choices[0].message.content)
