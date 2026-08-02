# Social publish receipts

Each successful or ambiguous external attempt receives one immutable,
sanitized receipt. A retry reconciles remote state before considering a post.
Receipts also preserve `rendererVersion: carousel-studio-1`, proving that a posted
visual came through the only allowed social renderer.
