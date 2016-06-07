// dependências
var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
var fs    = require('fs');
var https = require('https');

// recuperar valores da linha de comando
var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'https://localhost:8443/',
        ws_uri: 'ws://localhost:8888/kurento'
    }
});

// chaves para o ssl (https)
var configuracaoWebServer =
{
  key:  fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt')
};

var app = express();

/*
 * variáveis globais
 */
var identificadorUnico = 0;
var filaCandidatos = {};
var clienteKurento = null;
var professor = null;
var clientes = [];
var mensagemSemProfessor = 'Sem professor. Tente novamente mais tarde...';

/*
 * inicialização do servidor web
 */
var urlServidorAplicacao = url.parse(argv.as_uri);
var porta = urlServidorAplicacao.port;
var servidorWeb = https.createServer(configuracaoWebServer, app).listen(porta, function() {
    console.log('Servidor Demo WebRTC iniciado');
    console.log('Abrir ' + url.format(urlServidorAplicacao) + ' em um navegador com suporte a WebRTC');
});

// servidor WS
var wss = new ws.Server({
    server : servidorWeb,
    path : '/webrtc'
});

// identifica unicamente cada cliente conectado
function obterIdentificadorUnico() {
    identificadorUnico++;
    return identificadorUnico.toString();
}

/*
 * mensageria websocket
 */
wss.on('connection', function(ws) {
    // identificador único do cliente conectado
    var idSessao = obterIdentificadorUnico();
    console.log('Conexão recebida com o identificador ' + idSessao);
    // erro na conexão WS
    ws.on('error', function(erro) {
        console.log('Erro na conexão ' + idSessao);
        parar(idSessao);
    });
    // fechando conexão WS
    ws.on('close', function() {
        console.log('Conexão ' + idSessao + ' fechada');
        parar(idSessao);
    });
    // manipulador de mensagem recebida via WS
    ws.on('message', function(_mensagem) {
        var mensagem = JSON.parse(_mensagem);
        console.log('Conexão ' + idSessao + ' recebeu a mensagem', mensagem);

        // identifica o tipo da mensagem recebida
        switch (mensagem.id) {
        case 'mensagem-chat':
            novaMensagemChat(idSessao, ws, mensagem);
            break;

        case 'professor':
            iniciarProfessor(idSessao, ws, mensagem.ofertaSDP, mensagem.gravar, function(erro, respostaSDP) {
                if (erro) {
                    return ws.send(JSON.stringify({
                        id : 'respostaProfessor',
                        resposta : 'rejeitado',
                        mensagem : erro
                    }));
                }
                ws.send(JSON.stringify({
                    id : 'respostaProfessor',
                    resposta : 'aceito',
                    respostaSDP : respostaSDP
                }));
            });
            break;

        case 'aluno':
            iniciarAluno(idSessao, ws, mensagem.ofertaSDP, function(erro, respostaSDP) {
                if (erro) {
                    return ws.send(JSON.stringify({
                        id : 'respostaAluno',
                        resposta : 'rejeitado',
                        mensagem : erro
                    }));
                }

                ws.send(JSON.stringify({
                    id : 'respostaAluno',
                    resposta : 'aceito',
                    respostaSDP : respostaSDP
                }));
            });
            break;

        case 'parar':
            parar(idSessao);
            break;

        case 'candidatoICE':
            iniciarCandidatoICE(idSessao, mensagem.candidato);
            break;

        default:
            ws.send(JSON.stringify({
                id : 'erro',
                mensagem : 'Mensagem inválida ' + mensagem
            }));
            break;
        }
    });
});

/*
 * definição das funções
 */

// obtem o clienteKurento pela primeira vez e chama o callback
function obterClienteKurento(callback) {
    if (clienteKurento !== null) {
        return callback(null, clienteKurento);
    }
    // conecta ao KMS via websocket e obtem o cliente
    kurento(argv.ws_uri, function(erro, _clienteKurento) {
        if (erro) {
            console.log("Não foi possível encontrar um media server no endereço " + argv.ws_uri);
            return callback("Não foi possível encontrar um media server no endereço " + argv.ws_uri
                    + ". Finalizando com o erro: " + erro);
        }

        clienteKurento = _clienteKurento;
        callback(null, _clienteKurento); // chama a funcão de callback
    });
}

// inicia a transmissão do vídeo pelo professor
function iniciarProfessor(idSessao, ws, ofertaSDP, gravarAula, callback) {
    retirarFilaCandidatos(idSessao); // retira o professor da fila de candidatos

    // já existe um professor ativo?
    if (professor !== null) {
        parar(idSessao);
        return callback("Já existe um professor ativo. Tente novamente mais tarde...");
    }

    // dados do endpoint professor
    professor = {
        id : idSessao,
        pipeline : null,
        webRtcEndpoint : null,
        ws: ws
    }

    obterClienteKurento(function(erro, clienteKurento) { // esta é a funcão de callback
        if (erro) {
            parar(idSessao);
            return callback(erro);
        }

        if (professor === null) {
            parar(idSessao);
            return callback(mensagemSemProfessor);
        }

        // cria o pipeline de acordo com a semântica do KMS
        clienteKurento.create('MediaPipeline', function(erro, pipeline) {
            if (erro) {
                parar(idSessao);
                return callback(erro);
            }

            if (professor === null) {
                parar(idSessao);
                return callback(mensagemSemProfessor);
            }

            professor.pipeline = pipeline;
            // adiciona um endpoint webRTC no pipeline
            pipeline.create('WebRtcEndpoint', function(erro, webRtcEndpoint) {
                if (erro) {
                    parar(idSessao);
                    return callback(erro);
                }

                if (professor === null) {
                    parar(idSessao);
                    return callback(mensagemSemProfessor);
                }

                console.log("Gravar aula: " + gravarAula);

                if (gravarAula) {
                    // adiciona um endpoint para gravação no pipeline
                    pipeline.create('RecorderEndpoint', {uri: "file:///tmp/video/aula-" + idSessao + ".webm"}, function(erro, recorderEndpoint) {
                        if (erro) {
                            parar(idSessao);
                            return callback(erro);
                        }

                        webRtcEndpoint.connect(recorderEndpoint); // conecta os endpoints
                        recorderEndpoint.record(); // inicia a gravação do vídeo
                    });
                }

                professor.webRtcEndpoint = webRtcEndpoint;

                if (filaCandidatos[idSessao]) {
                    while(filaCandidatos[idSessao].length) {
                        var candidato = filaCandidatos[idSessao].shift();
                        webRtcEndpoint.addIceCandidate(candidato);
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(evento) {
                    var candidato = kurento.register.complexTypes.IceCandidate(evento.candidate);
                    ws.send(JSON.stringify({
                        id : 'candidatoICE',
                        candidato : candidato
                    }));
                });

                // processa a oferta SDP
                webRtcEndpoint.processOffer(ofertaSDP, function(erro, respostaSDP) {
                    if (erro) {
                        parar(idSessao);
                        return callback(erro);
                    }

                    if (professor === null) {
                        parar(idSessao);
                        return callback(mensagemSemProfessor);
                    }

                    callback(null, respostaSDP);
                });

                webRtcEndpoint.gatherCandidates(function(erro) {
                    if (erro) {
                        parar(idSessao);
                        return callback(erro);
                    }
                });
            });
        });
    });
}

// inicia a recepção do vídeo para um aluno
function iniciarAluno(idSessao, ws, ofertaSDP, callback) {
    retirarFilaCandidatos(idSessao); // retira o aluno da fila de candidatos

    // sem professor
    if (professor === null) {
        parar(idSessao);
        return callback(mensagemSemProfessor);
    }

    // adiciona um endpoint webRTC no pipeline
    professor.pipeline.create('WebRtcEndpoint', function(erro, webRtcEndpoint) {
        if (erro) {
            parar(idSessao);
            return callback(erro);
        }
        clientes[idSessao] = {
            "webRtcEndpoint" : webRtcEndpoint,
            "ws" : ws
        }

        // sem professor
        if (professor === null) {
            parar(idSessao);
            return callback(mensagemSemProfessor);
        }

        if (filaCandidatos[idSessao]) {
            while(filaCandidatos[idSessao].length) {
                var candidato = filaCandidatos[idSessao].shift();
                webRtcEndpoint.addIceCandidate(candidato);
            }
        }

        webRtcEndpoint.on('OnIceCandidate', function(event) {
            var candidato = kurento.register.complexTypes.IceCandidate(event.candidate);
            ws.send(JSON.stringify({
                id : 'candidatoICE',
                candidato : candidato
            }));
        });

        // processa a oferta SDP
        webRtcEndpoint.processOffer(ofertaSDP, function(erro, respostaSDP) {
            if (erro) {
                parar(idSessao);
                return callback(erro);
            }
            if (professor === null) {
                parar(idSessao);
                return callback(mensagemSemProfessor);
            }

            professor.webRtcEndpoint.connect(webRtcEndpoint, function(erro) {
                if (erro) {
                    parar(idSessao);
                    return callback(erro);
                }
                if (professor === null) {
                    parar(idSessao);
                    return callback(mensagemSemProfessor);
                }

                callback(null, respostaSDP);
                webRtcEndpoint.gatherCandidates(function(erro) {
                    if (erro) {
                        parar(idSessao);
                        return callback(erro);
                    }
                });
            });
        });
    });
}

function retirarFilaCandidatos(idSessao) {
    if (filaCandidatos[idSessao]) {
        delete filaCandidatos[idSessao];
    }
}

function novaMensagemChat(idSessao, ws, mensagem) {
    var mensagemJSON = JSON.stringify({
        id : 'chat',
        apelido : mensagem.apelido,
        texto : mensagem.texto
    });

    // para todos os alunos
    for (var i in clientes) {
        var aluno = clientes[i];
        if (aluno.ws) {
            aluno.ws.send(mensagemJSON);
        }
    }
    // envia a mensagem tambem para quem enviou
    ws.send(mensagemJSON);

    // envia a mensagem para o professor
    professor.ws.send(mensagemJSON);
}

function parar(idSessao) {
    // caso seja o professor que esteja parando
    if (professor !== null && professor.id == idSessao) {
        // para todos os alunos
        for (var i in clientes) {
            var aluno = clientes[i];
            if (aluno.ws) {
                aluno.ws.send(JSON.stringify({
                    id : 'pararComunicacao'
                }));
            }
        }
        professor.pipeline.release();
        professor = null; // sem professor
        clientes = []; // sem alunos

    } else if (clientes[idSessao]) { // caso seja o aluno que esteja parando
        clientes[idSessao].webRtcEndpoint.release();
        delete clientes[idSessao];
    }

    retirarFilaCandidatos(idSessao);
}

function iniciarCandidatoICE(idSessao, _candidato) {
    var candidato = kurento.register.complexTypes.IceCandidate(_candidato);
    // dados de professor
    if (professor && professor.id === idSessao && professor.webRtcEndpoint) {
        console.info('Enviando dados de um professor');
        professor.webRtcEndpoint.addIceCandidate(candidato);
    }
    else if (clientes[idSessao] && clientes[idSessao].webRtcEndpoint) { // dados de aluno
        console.info('Enviando dados de um aluno');
        clientes[idSessao].webRtcEndpoint.addIceCandidate(candidato);
    }
    else {
        console.info('Agendando candidato');
        if (!filaCandidatos[idSessao]) {
            filaCandidatos[idSessao] = [];
        }
        filaCandidatos[idSessao].push(candidato);
    }
}

app.use(express.static(path.join(__dirname, 'static')));
