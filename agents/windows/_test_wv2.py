import webview
import os

w = webview.create_window(
    "Test",
    html="<h1 style='font-size:48px;text-align:center;margin-top:60px'>OK</h1>",
    width=300,
    height=200,
)
webview.start(
    private_mode=False,
    storage_path=os.path.join(
        os.environ.get("LOCALAPPDATA", ""), "Lumina", "wv2"
    ),
)
