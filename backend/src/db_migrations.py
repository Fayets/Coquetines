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


def ensure_movimientos_caja_pago_mixto_column() -> None:
    """Columna pago_mixto en Movimientos_Caja (Pony no altera Postgres en tablas existentes)."""
    provider = (config("DB_PROVIDER", default="") or "").strip().lower()
    if provider in ("postgres", "postgresql"):
        _postgres_movimientos_pago_mixto()
    elif provider == "sqlite":
        _sqlite_movimientos_pago_mixto()


def _postgres_movimientos_pago_mixto() -> None:
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
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'Movimientos_Caja'
            """
        )
        if not cur.fetchone():
            cur.close()
            return
        cur.execute(
            'ALTER TABLE "Movimientos_Caja" ADD COLUMN IF NOT EXISTS pago_mixto BOOLEAN NOT NULL DEFAULT false'
        )
        cur.close()
        print("[startup] Movimientos_Caja.pago_mixto verificada (PostgreSQL).")
    finally:
        conn.close()


def _sqlite_movimientos_pago_mixto() -> None:
    import sqlite3

    path = config("DB_NAME")
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='Movimientos_Caja'"
        )
        if not cur.fetchone():
            cur.close()
            return
        try:
            cur.execute("ALTER TABLE Movimientos_Caja ADD COLUMN pago_mixto INTEGER NOT NULL DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError as e:
            conn.rollback()
            if "duplicate column" not in str(e).lower():
                raise
        cur.close()
        print("[startup] Movimientos_Caja.pago_mixto verificada (SQLite).")
    finally:
        conn.close()


def ensure_ventas_pagos_y_tipo_precio_linea() -> None:
    """Tabla Ventas_Pagos y columna tipo_precio en Venta_Productos + backfill idempotente."""
    provider = (config("DB_PROVIDER", default="") or "").strip().lower()
    if provider in ("postgres", "postgresql"):
        _postgres_ventas_pagos_y_tipo_precio()
    elif provider == "sqlite":
        _sqlite_ventas_pagos_y_tipo_precio()
    # otros providers: sin acción


def _postgres_ventas_pagos_y_tipo_precio() -> None:
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
            'ALTER TABLE "Venta_Productos" ADD COLUMN IF NOT EXISTS tipo_precio VARCHAR(64)'
        )
        cur.execute(
            """
            UPDATE "Venta_Productos" vp
            SET tipo_precio = v.metodo_pago
            FROM "Ventas" v
            WHERE vp.venta = v.id
              AND (vp.tipo_precio IS NULL OR trim(vp.tipo_precio) = '')
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS "Ventas_Pagos" (
                id SERIAL PRIMARY KEY,
                venta_id INTEGER NOT NULL REFERENCES "Ventas"(id) ON DELETE CASCADE,
                metodo_pago VARCHAR(255) NOT NULL,
                monto DOUBLE PRECISION NOT NULL
            )
            """
        )
        cur.execute(
            'CREATE INDEX IF NOT EXISTS idx_ventas_pagos_venta_id ON "Ventas_Pagos"(venta_id)'
        )
        cur.execute(
            """
            INSERT INTO "Ventas_Pagos" (venta_id, metodo_pago, monto)
            SELECT v.id, v.metodo_pago, v.total
            FROM "Ventas" v
            WHERE NOT EXISTS (SELECT 1 FROM "Ventas_Pagos" p WHERE p.venta_id = v.id)
            """
        )
        cur.close()
        print("[startup] Ventas_Pagos + Venta_Productos.tipo_precio verificados (PostgreSQL).")
    finally:
        conn.close()


def _sqlite_ventas_pagos_y_tipo_precio() -> None:
    import sqlite3

    path = config("DB_NAME")
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        try:
            cur.execute("ALTER TABLE Venta_Productos ADD COLUMN tipo_precio TEXT")
            conn.commit()
        except sqlite3.OperationalError as e:
            conn.rollback()
            if "duplicate column" not in str(e).lower():
                raise
        cur.execute(
            """
            UPDATE Venta_Productos
            SET tipo_precio = (
                SELECT metodo_pago FROM Ventas v WHERE v.id = Venta_Productos.venta
            )
            WHERE tipo_precio IS NULL OR trim(tipo_precio) = ''
            """
        )
        conn.commit()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS Ventas_Pagos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                venta_id INTEGER NOT NULL REFERENCES Ventas(id) ON DELETE CASCADE,
                metodo_pago TEXT NOT NULL,
                monto REAL NOT NULL
            )
            """
        )
        conn.commit()
        cur.execute(
            """
            INSERT INTO Ventas_Pagos (venta_id, metodo_pago, monto)
            SELECT v.id, v.metodo_pago, v.total
            FROM Ventas v
            WHERE NOT EXISTS (SELECT 1 FROM Ventas_Pagos p WHERE p.venta_id = v.id)
            """
        )
        conn.commit()
        cur.close()
        print("[startup] Ventas_Pagos + Venta_Productos.tipo_precio verificados (SQLite).")
    finally:
        conn.close()


def ensure_caja_diaria_turno_y_unique() -> None:
    """Columna turno + clave única (sucursal, fecha, turno) en Cajas_Diarias."""
    provider = (config("DB_PROVIDER", default="") or "").strip().lower()
    if provider in ("postgres", "postgresql"):
        _postgres_caja_diaria_turno()
    elif provider == "sqlite":
        _sqlite_caja_diaria_turno()


def _postgres_caja_diaria_turno() -> None:
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
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'Cajas_Diarias'
            """
        )
        if not cur.fetchone():
            cur.close()
            return

        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'Cajas_Diarias' AND column_name = 'turno'
            """
        )
        if not cur.fetchone():
            cur.execute(
                'ALTER TABLE "Cajas_Diarias" ADD COLUMN turno VARCHAR(10) NOT NULL DEFAULT \'MAÑANA\''
            )
            cur.execute('UPDATE "Cajas_Diarias" SET turno = \'MAÑANA\' WHERE turno IS NULL OR trim(turno) = \'\'')
            print("[startup] Cajas_Diarias.turno agregada (PostgreSQL).")

        cur.execute(
            """
            SELECT c.conname, pg_get_constraintdef(c.oid, true) AS defn
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'Cajas_Diarias' AND c.contype = 'u'
            """
        )
        for conname, defn in cur.fetchall():
            if defn and "turno" not in defn.lower():
                cur.execute(f'ALTER TABLE "Cajas_Diarias" DROP CONSTRAINT IF EXISTS "{conname}"')
                print(f'[startup] Restricción única antigua en Cajas_Diarias eliminada: "{conname}".')

        cur.execute(
            """
            SELECT 1 FROM pg_constraint
            WHERE conname = 'uq_cajas_diarias_sucursal_fecha_turno'
            """
        )
        if not cur.fetchone():
            cur.execute(
                """
                ALTER TABLE "Cajas_Diarias"
                ADD CONSTRAINT uq_cajas_diarias_sucursal_fecha_turno
                UNIQUE (sucursal_id, fecha, turno)
                """
            )
            print("[startup] UNIQUE (sucursal_id, fecha, turno) en Cajas_Diarias verificada (PostgreSQL).")

        cur.close()
    finally:
        conn.close()


def _sqlite_caja_diaria_turno() -> None:
    import sqlite3

    path = config("DB_NAME")
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Cajas_Diarias'")
        if not cur.fetchone():
            cur.close()
            return
        cur.execute("PRAGMA table_info(Cajas_Diarias)")
        cols = [r[1] for r in cur.fetchall()]
        if "turno" not in cols:
            try:
                cur.execute(
                    "ALTER TABLE Cajas_Diarias ADD COLUMN turno TEXT NOT NULL DEFAULT 'MAÑANA'"
                )
                conn.commit()
            except sqlite3.OperationalError as e:
                conn.rollback()
                if "duplicate column" not in str(e).lower():
                    raise
            cur.execute("UPDATE Cajas_Diarias SET turno = 'MAÑANA' WHERE turno IS NULL OR trim(turno) = ''")
            conn.commit()
            print("[startup] Cajas_Diarias.turno agregada (SQLite).")

        for idx_name in ("idx_cajas_diarias_suc_fecha_turno",):
            try:
                cur.execute(
                    f"""
                    CREATE UNIQUE INDEX IF NOT EXISTS {idx_name}
                    ON Cajas_Diarias (sucursal_id, fecha, turno)
                    """
                )
                conn.commit()
            except sqlite3.OperationalError:
                conn.rollback()
        cur.close()
    finally:
        conn.close()
