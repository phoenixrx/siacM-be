// routes/pacientes.js
const express = require("express");
const router = express.Router();
const { retornarQuery } = require("../auth");
const {
  authenticateToken,
  registrarErrorPeticion,
} = require("../middlewares/autenticarToken");

// GET /api/pacientes
router.get("/busqueda", async (req, res) => {
    const { tipo_cedula, cedula, apellidos, nombres, sexo, page = 1, perPage = 10 } = req.query; 
    const offset = (page - 1) * perPage;

    if (tipo_cedula && !['V', 'E', 'G', 'J', 'P', 'M'].includes(tipo_cedula)) {
        return res.status(400).json({ error: 'Tipo de cédula inválido.' });
    }
    if (cedula && cedula.length < 3) {
        return res.status(400).json({ error: 'Cédula debe tener al menos 3 caracteres.' });
    }

    let filterCondition = [];
    let params =[];

    if(nombres ) {
        filterCondition.push('nombres LIKE ?')
        params.push(`%${nombres}%`)
    }

    if(apellidos ) {
        filterCondition.push('apellidos LIKE ?')
        params.push(`%${apellidos}%`)
    }

    if(cedula){
        filterCondition.push('cedula LIKE ?')
        params.push(`%${cedula}%`)
    }

    if(tipo_cedula){
        filterCondition.push('tipo_cedula = ?')
        params.push(`${tipo_cedula}`)
    }
    
    if(sexo){
        filterCondition.push('sexo LIKE ?')
        params.push(`%${sexo}%`)
    }

    if(filterCondition.length === 0){        
        return res.status(400).json({ error: 'Debe proporcionar al menos un criterio de búsqueda (nombre, apellido, cédula, tipo de cédula o sexo).' });
    }

    let whereClause = filterCondition.join(' AND ');
    
    let query_paciente =`
        SELECT 
            *
        FROM pacientes 
        WHERE ${whereClause}
        ORDER BY cedula, nombres, apellidos DESC 
        LIMIT ? OFFSET ?
    `;
    let paramCount= params;
    params.push(perPage)
    params.push(offset)
    try {
        const pacientes = await retornarQuery(query_paciente, params);
        const countResult = await retornarQuery(
            `SELECT COUNT(*) AS total_pacientes FROM pacientes WHERE ${whereClause}`, paramCount); 

        const total_pacientes = countResult.data[0]?.total_pacientes || 0;
        
        const totalPages =
            Math.ceil(total_pacientes / perPage) <= 10
                ? Math.ceil(total_pacientes / perPage)
                : 10;
        res.json({
            success: true,
            resultados: pacientes,
            pagination: {
                page,
                perPage,
                totalPages,
                total_pacientes,
                },            
            }
        );
    } catch (error) {
        registrarErrorPeticion(req, error);
        res.status(500).json({ error: 'Error al buscar pacientes.' });
    }
    
});

router.get("/buscar-paciente", async (req, res) => {
    const { tipo_cedula, cedula } = req.query; 

    if (tipo_cedula && !['V', 'E', 'G', 'J', 'P', 'M'].includes(tipo_cedula)) {
        return res.status(400).json({ error: 'Tipo de cédula inválido.' });
    }
    if (cedula.length < 3) {
        return res.status(400).json({ error: 'Cédula debe tener al menos 3 caracteres.' });
    }

    
    let query_paciente =`
        SELECT 
            *
        FROM pacientes 
        WHERE tipo_cedula=? AND cedula=?
        ORDER BY cedula, nombres, apellidos DESC 
        LIMIT 1
    `;
    
    try {
        const pacientes = await retornarQuery(query_paciente, [tipo_cedula, cedula]);

        if(pacientes.data?.length === 0){
            return res.status(404).json({ success: false, error: 'Paciente no encontrado.' });
        }
       
        res.json({
            success: true,
            paciente: pacientes,               
            }
        );
    } catch (error) {
        registrarErrorPeticion(req, error);
        res.status(500).json({ error: 'Error al buscar pacientes.' });
    }
    
});

router.get("/buscar-nota/:id_paciente/:id_cli", async (req, res) => {
    const { id_paciente, id_cli } = req.params; 

   
    if (!id_paciente|| isNaN(id_cli)) {
        return res.status(400).json({ error: 'paciente incorrecto.' });
    }

    
    let query_paciente =`
        SELECT 
            np.nota
        FROM notas_paciente np
        inner join pacientes p on p.id_paciente=np.id_paciente
        WHERE p.uuid_paciente=? and id_cli=?
        ORDER BY np.id_nota_paciente DESC 
        LIMIT 1`;
    
    try {
        const nota = await retornarQuery(query_paciente, [id_paciente, id_cli]);

        if(nota.data?.length === 0){
            return res.json({ success: false, error: 'Sin notas.' });
        }
       
        res.json({
            success: true,
            notas: nota  
            }
        );
    } catch (error) {
        registrarErrorPeticion(req, error);
        res.status(500).json({ error: 'Error al buscar pacientes.' });
    }
    
});

router.get('/cuentas-cobrar/:id_paciente', async (req, res) => {
  const id_paciente = req.params.id_paciente;
  const { id_cli } = req.query;

  if(!id_paciente || !id_cli){
    return res.status(422).json({ error: 'Faltan parámetros obligatorios' });
  }

  let query = `
    SELECT 
    f.id_factura,
    f.factura,
    f.razon_social,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.cuotas,
    f.id_admision,
    a.id_paciente,
    cp.monto AS monto_inicial,
    m.simbolo AS moneda,
    fp.descripcion AS forma_pago,
    SUM(cpg.monto_pago) AS monto_pendiente,
    ff.path,
    concat(p.nombres, ' ', p.apellidos) as paciente
FROM facturas f
INNER JOIN admisiones a ON a.id_admision = f.id_admision
INNER JOIN control_pagos cp ON cp.id_externa = f.id_admision
INNER JOIN monedas m ON m.id_moneda = cp.id_moneda
INNER JOIN formas_pago fp ON fp.id_forma_pago = cp.id_forma_pago
INNER JOIN cuotas_pagar cpg ON cpg.id_admision = f.id_admision
INNER JOIN pacientes p ON p.id_paciente = a.id_paciente
INNER JOIN facturas_formatos ff ON ff.id =f.formato_factura
WHERE 
    f.activo = 1
    AND f.contado = 0
    AND f.id_cli = ?
    AND p.uuid_paciente = ?
    AND cp.activo = 1
    AND fp.credito = 1
    AND cpg.activo = 1
    AND cpg.estado != 'Pagado'
GROUP BY
    f.id_factura,
    f.factura,
    f.razon_social,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.cuotas,
    f.id_admision,
    a.id_paciente,
    cp.monto,
    m.simbolo,
    fp.descripcion
  HAVING SUM(cpg.monto_pago) >0;
  `;

  try {
    const result = await retornarQuery(query, [id_cli,id_paciente]);    
    if (result.error) {
      return res.json({
        success: false,
        error,
      });
    }
    if(result.data.length<1){
        return res.json({
        success: true,
        data: [],
        message: "Paciente sin cuentas por cobrar",
      });
    }
    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });      
  }

}
)

module.exports = router;