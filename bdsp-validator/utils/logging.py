from __future__ import annotations

import logging


def get_logger(logger_name: str) -> logging.Logger:
    """Get the logger by name"""
    f = '%(asctime)s|%(levelname)s|%(name)s|%(message)s'
    logging.basicConfig(level=logging.INFO, format=f)
    return logging.getLogger(logger_name)