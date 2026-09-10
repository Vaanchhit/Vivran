import logging
import sys

_configured = False


def setup_logging() -> logging.Logger:
    global _configured
    logger = logging.getLogger("vivran")
    if not _configured:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(name)s: %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        _configured = True
    return logger


logger = setup_logging()