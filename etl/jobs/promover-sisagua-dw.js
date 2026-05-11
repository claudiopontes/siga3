const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://varadouro:varadouro_dev@localhost:5432/varadouro_digital' });

const sql = `
  INSERT INTO dw.fato_sisagua_parametro
    (endpoint, uf, codigo_municipio_ibge, nome_municipio,
     ano, mes, competencia, parametro, resultado, valor, unidade,
     fora_padrao, data_coleta, forma_abastecimento, sistema_abastecimento, ponto_coleta)
  SELECT
    endpoint, uf, codigo_municipio_ibge, nome_municipio,
    ano, mes, competencia, parametro, resultado, valor, unidade,
    fora_padrao, data_coleta, forma_abastecimento, sistema_abastecimento, ponto_coleta
  FROM stage.sisagua_parametros_stg
  ON CONFLICT DO NOTHING
`;

pool.query(sql).then(r => {
  console.log('Registros inseridos no DW:', r.rowCount);
  return pool.query('SELECT COUNT(*) as n FROM dw.fato_sisagua_parametro');
}).then(r => {
  console.log('Total DW agora:', r.rows[0].n);
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
