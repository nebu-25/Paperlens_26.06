from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/papers", tags=["papers"])


@router.post("/extract-text")
async def extract_text(file: UploadFile = File(...)) -> dict[str, object]:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    try:
        import fitz

        content = await file.read()
        document = fitz.open(stream=content, filetype="pdf")
        page_text = [page.get_text("text") for page in document]
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(status_code=422, detail="PDF 텍스트를 추출하지 못했습니다.") from exc

    return {
        "filename": file.filename,
        "page_count": len(page_text),
        "text": "\n\n".join(page_text),
    }

