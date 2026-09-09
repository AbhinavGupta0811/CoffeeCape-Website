import nltk

packages = ["punkt", "punkt_tab", "stopwords", "wordnet"]
for pkg in packages:
    print(f"Downloading NLTK: {pkg} ...", end=" ")
    nltk.download(pkg, quiet=True)
    print("✓")

print("\n✅ Setup complete! Now run: python app.py")