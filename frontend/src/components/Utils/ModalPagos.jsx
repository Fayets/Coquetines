import React from 'react'
import { useState,useEffect } from 'react';
import Swal from 'sweetalert2';

const PagoModal = ({ isOpen, onClose, onSave, pagoInicial }) => {
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");

  useEffect(() => {
    if (pagoInicial) {
      setFecha(pagoInicial.fecha || "");
      setMonto(pagoInicial.monto || "");
    }
  }, [pagoInicial]);

  const handleGuardar = () => {
    onSave({ fecha, monto });
    Swal.fire({
      icon: 'success',
      title: 'Pago guardado',
      text: 'El pago se ha guardado correctamente.',
      confirmButtonText: 'Aceptar'
    });
  };

  if (!isOpen) return null;
  
    return (
      <div style={overlayStyles}>
        <div style={modalStyles}>
          <h2 className="text-xl font-semibold mb-4">Registrar Pago</h2>
          <div style={inputContainerStyles}>
            <label className="block mb-1">Fecha</label>
            <input
              type="date"
              style={inputStyles}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div style={inputContainerStyles}>
            <label className="block mb-1">Monto</label>
            <input
              type="number"
              style={inputStyles}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  //! Estilos
  const overlayStyles = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  };
  
  const modalStyles = {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "8px",
    width: "400px",
    textAlign: "center",
  };
  
  const inputContainerStyles = {
    margin: "10px 0",
  };
  
  const inputStyles = {
    width: "100%",
    padding: "8px",
    marginTop: "5px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  };

export default PagoModal