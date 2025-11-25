// routes/header.js
const express = require('express');
const router = express.Router();
const { retornar_query } = require('../auth');

router.get('/header/:id_cli', async (req, res) => {
    const {id_cli} = req.params;  
    let estilos= `
    <styles>
    header{
        position: sticky;
        top: 0;
        background: white;
        z-index:10;    
        padding: 1em;
        margin: -1em;
        width: 100vw;
        height: 150px;
    }
    #encabezado{
        display: contents;
    }
    thead{
        top: 150px!important;
    }
    .datos_emrpesa{
            font-size: x-small!important;
        }
    body{
        background-color: white!important;
        overflow-y: auto;
        padding: 0 1em !important;
    }
    .logo{
        max-width: 300px!important;
        max-height: 150px!important;
       
    }
    h5{
        font-size: smaller!important;
        font-weight: bold;
    }
    h1{
        font-size: large!important;
        font-weight: bold; 
    }
    header{
        display: flex!important;
        margin-bottom: 10px!important;
        align-items: center!important;
        background-color: white!important;
    }
    .logo_sis{
        max-height: 1.5em;
        position:fixed;
        top:0;
        right:0;
    }
    .fecha_impresion{
        position: fixed;
        top: 2.3em;
        right: 0;
        font-size: x-small;
    }
    .titulo_tabla{
        font-weight: bold;
        color: rgb(70, 70, 70);
        font-size: 1.2em;
        margin-bottom: .5em!important;
    }
    @media print {
        header{
        position: relative!important;
        top: 0;
        background:   white  ;
        z-index: 10;
    }}
    </styles>`
    try {
        let query= `
            SELECT 
                perfil_usuario_empresa.* 
            FROM 
                perfil_usuario_empresa            
            WHERE 
                perfil_usuario_empresa.id_usuario_empresa =?;`
        
        let resultados;
        try {
            resultados = await retornar_query(query, [id_cli]);
        } catch (error) { registrarErrorPeticion(req, error);           
            resultados = [];
        }

        let logo= resultados[0].logo_empresa.replace("../","");
        const fecha = new Date();
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        let dia = String(fecha.getDate()).padStart(2, '0');
        let hora = String(fecha.getHours()).padStart(2, '0');
        let minutos = String(fecha.getMinutes()).padStart(2, '0');
        let segundos = String(fecha.getSeconds()).padStart(2, '0');

        fechaImpresion= `${dia}/${month}/${year} ${hora}:${minutos}:${segundos}`

        let html=`
            <img src="https://siac.empresas.historiaclinica.org/${logo}" alt="logo" class="logo"></img>
            <img src="https://siac.empresas.historiaclinica.org/images/logograma.png" alt="logo" class="logo_sis"></img>
            <span class="fecha_impresion">${fechaImpresion}</span>
            <div class="datos_emrpesa ps-2">
            <h1 class= "nombre_empresa">${resultados[0].nombre}</h1>
                <h5 class="direccion_empresa mb-0">${resultados[0].direccion}</h5>
                <h5 class="correo_empresa mb-0">${resultados[0].correo}</h5> <h5 class="correo_empresa mb-0">${resultados[0].telefono}</h4>
                <h5 class="webpage mb-0"><a href="${resultados[0].web}"></a>${resultados[0].web}</h5>
            </div>
            `

        return res.json({
            success: true,
            html: html,
            estilos: estilos
        });

    } catch (error) { registrarErrorPeticion(req, error);
       
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor al buscar el header'
        });
    }
});

module.exports = router;