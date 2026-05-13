-- 223_fix_nomes_municipios.sql
-- Corrige nomes de municípios sem acentuação/padronização na tabela mis_bolsa_familia_bpc.
-- Execute uma vez após identificar registros com nomes incorretos vindos do nome dos arquivos XLSX.

UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Acrelândia'          WHERE codigo_ibge_municipio = '1200013';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Assis Brasil'         WHERE codigo_ibge_municipio = '1200054';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Brasiléia'            WHERE codigo_ibge_municipio = '1200104';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Bujari'               WHERE codigo_ibge_municipio = '1200138';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Capixaba'             WHERE codigo_ibge_municipio = '1200179';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Cruzeiro do Sul'      WHERE codigo_ibge_municipio = '1200203';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Epitaciolândia'       WHERE codigo_ibge_municipio = '1200252';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Feijó'                WHERE codigo_ibge_municipio = '1200302';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Jordão'               WHERE codigo_ibge_municipio = '1200328';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Mâncio Lima'          WHERE codigo_ibge_municipio = '1200336';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Manoel Urbano'        WHERE codigo_ibge_municipio = '1200344';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Marechal Thaumaturgo' WHERE codigo_ibge_municipio = '1200351';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Plácido de Castro'    WHERE codigo_ibge_municipio = '1200385';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Porto Walter'         WHERE codigo_ibge_municipio = '1200393';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Rio Branco'           WHERE codigo_ibge_municipio = '1200401';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Rodrigues Alves'      WHERE codigo_ibge_municipio = '1200427';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Santa Rosa do Purus'  WHERE codigo_ibge_municipio = '1200435';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Senador Guiomard'     WHERE codigo_ibge_municipio = '1200450';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Sena Madureira'       WHERE codigo_ibge_municipio = '1200500';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Tarauacá'             WHERE codigo_ibge_municipio = '1200609';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Xapuri'               WHERE codigo_ibge_municipio = '1200708';
UPDATE social.mis_bolsa_familia_bpc SET nome_municipio = 'Porto Acre'           WHERE codigo_ibge_municipio = '1200807';
