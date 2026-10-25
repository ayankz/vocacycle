from pathlib import Path
import sys
import io
import torchaudio

from fastapi import Response
from pydantic import BaseModel
from fastapi import FastAPI

COSYVOICE_DIR = Path(
    "/Users/ayan_dev/Desktop/coding_ayan/cosyvoice-test/CosyVoice"
)

sys.path.insert(
    0,
    str(COSYVOICE_DIR / "third_party" / "Matcha-TTS")
)

from cosyvoice.cli.cosyvoice import AutoModel

app = FastAPI()

model = AutoModel(
    model_dir=str(
        COSYVOICE_DIR / "pretrained_models/Fun-CosyVoice3-0.5B"
    ),
    load_trt=False,
    load_vllm=False,
    fp16=False,
)


@app.get("/health")
def health():
    return {"status": "ok"}

class SynthesizeRequest(BaseModel):
    text: str


@app.post("/synthesize")
def synthesize(request: SynthesizeRequest):
    audio_buffer = io.BytesIO()

    for result in model.inference_cross_lingual(
        tts_text=(
            "You are a helpful assistant.<|endofprompt|>"
            + request.text
        ),
        prompt_wav=str(
            COSYVOICE_DIR / "asset/cross_lingual_prompt.wav"
        ),
        stream=False,
        text_frontend=False,
    ):
        torchaudio.save(
            audio_buffer,
            result["tts_speech"],
            model.sample_rate,
            format="wav",
        )

        return Response(
            content=audio_buffer.getvalue(),
            media_type="audio/wav",
        )

    raise RuntimeError("CosyVoice returned no audio")