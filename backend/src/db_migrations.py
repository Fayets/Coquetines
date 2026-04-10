"""
DDL previo al generate_mapping de Pony: columnas nuevas en tablas ya existentes.
Pony no hace ALTER en PostgreSQL al usar create_tables=True sobre tablas viejas.
"""

from __future__ import annotations

from decouple import config


def ensure_products_precios_contado_columns() -> None:
    """Asegura precio_efectivo y precio_transferencia en Products (idempotente)."""
    provider = (config("DB_PROVIDER", default="") or "").strip().lower()
    if provider in ("postgres", "postgresql"):
        _postgres_add_product_columns()
    elif provider == "sqlite":
        _sqlite_add_product_columns()
    # otros providers: sin acción (ajustar si hace falta)


def _postgres_add_product_columns() -> None:
    import psycopg2

    conn = psycopg2.connect(
        user=config("DB_USER"),
        password=config("DB_PASS"),
        host=config("DB_HOST"),
        dbname=config("DB_NAME"),
        connect_timeout=15,
    )
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            'ALTER TABLE "Products" ADD COLUMN IF NOT EXISTS precio_efectivo DOUBLE PRECISION DEFAULT 0'
        )
        cur.execute(
            'ALTER TABLE "Products" ADD COLUMN IF NOT EXISTS precio_transferencia DOUBLE PRECISION DEFAULT 0'
        )
        cur.close()
        print("[startup] Columnas Products.precio_efectivo / precio_transferencia verificadas (PostgreSQL).")
    finally:
        conn.close()


def _sqlite_add_product_columns() -> None:
    import sqlite3

    # Pony suele usar ruta en host para sqlite o nombre; ajustá si tu .env difiere
    path = config("DB_NAME")
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        for sql in (
            "ALTER TABLE Products ADD COLUMN precio_efectivo REAL DEFAULT 0",
            "ALTER TABLE Products ADD COLUMN precio_transferencia REAL DEFAULT 0",
        ):
            try:
                cur.execute(sql)
                conn.commit()
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    conn.rollback()
                    continue
                raise
        cur.close()
        print("[startup] Columnas Products precio_efectivo / precio_transferencia verificadas (SQLite).")
    finally:
        conn.close()
