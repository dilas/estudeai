// compartilhar janela
var screen = new Screen('estude-ai');
// abrindo conexão WS para fazer sinalização
var ws = new WebSocket('wss://' + location.host + '/webrtc');
// tag de video
var video;
// objeto webRtc disponibilizado pelo kurentoUtils
var webRtcPeer;
// identifica se o vídeo da aula deve ser gravado ou não
var gravarAula;

window.onload = function() {
    console = new Console();

    // elementos html
    video = document.getElementById('video');

    screen.onaddstream = function(e) {
        attachMediaStream(video, e.stream);
    };

    // registrando eventos
    document.getElementById('professor').addEventListener('click', function() { enviarVideoProfessor(); } );
    document.getElementById('aluno').addEventListener('click', function() { receberVideoAluno(); } );
    document.getElementById('parar').addEventListener('click', function() { parar(); } );
    document.getElementById('capturar-janela').addEventListener('click', function() { screen.share(); } );
    document.getElementById('enviar-msg-chat').addEventListener('click', function () { enviarMensagemChat(); });
}

window.onbeforeunload = function() {
    // fechando conexão WS
    ws.close();
}

// manipulador de mensagens WS
ws.onmessage = function(json) {
    var mensagem = JSON.parse(json.data);
    console.info('Mensagem recebida: ' + json.data);

    switch (mensagem.id) {
    case 'chat':
        processarMensagemChat(mensagem);
        break;
    case 'respostaProfessor':
        processarRespostaProfessor(mensagem);
        break;
    case 'respostaAluno':
        processarRespostaAluno(mensagem);
        break;
    case 'pararComunicacao':
        liberarRecursos();
        break;
    case 'candidatoICE':
        webRtcPeer.addIceCandidate(mensagem.candidato)
        break;
    default:
        console.error('Mensagem não identificada ', mensagem);
    }
}

function processarMensagemChat(mensagem) {
    console.info(mensagem.apelido + ': ' + mensagem.texto);
}

function enviarMensagemChat() {
    var mensagem = {
        id : 'mensagem-chat',
        apelido : document.getElementById('apelido').value,
        texto : document.getElementById('mensagem').value
    };
    
    enviarMensagem(mensagem);
}

function processarRespostaProfessor(mensagem) {
    if (mensagem.resposta != 'aceito') {
        var mensagemErro = mensagem.mensagem ? mensagem.mensagem : 'Erro desconhecido';
        console.warn('Chamada não foi aceita pelo seguinte motivo: ' + mensagemErro);
        liberarRecursos();
    } else {
        webRtcPeer.processAnswer(mensagem.respostaSDP);
    }
}

function processarRespostaAluno(mensagem) {
    if (mensagem.resposta != 'aceito') {
        var mensagemErro = mensagem.mensagem ? mensagem.mensagem : 'Erro desconhecido';
        console.warn('Chamada não foi aceita pelo seguinte motivo: ' + mensagemErro);
        liberarRecursos();
    } else {
        webRtcPeer.processAnswer(mensagem.respostaSDP);
    }
}

function enviarVideoProfessor() {
    if (!webRtcPeer) {
        exibirAguarde(video);

        var options = {
            localVideo: video,
            onicecandidate : tratarEventoCandidatoICE
        }

        // somente envia o stream de video
        webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(erro) {
            if(erro) return onError(erro);
            // cria oferta SDP para negociação de streaming
            this.generateOffer(ofertaProfessor);
        });
    }
}

function ofertaProfessor(erro, ofertaSDP) {
    if (erro) return onError(erro);

    // verifica se deve gravar aula
    gravarAula = $('#gravar').is(':checked');

    var mensagem = {
        id : 'professor',
        ofertaSDP : ofertaSDP,
        gravar : gravarAula
    };
    enviarMensagem(mensagem);
}

function receberVideoAluno() {
    if (!webRtcPeer) {
        exibirAguarde(video);

        var options = {
            remoteVideo: video,
            onicecandidate : tratarEventoCandidatoICE
        }

        // somente recebe o stream de video
        webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(erro) {
            if(erro) return onError(erro);
            // cria oferta SDP para negociação de streaming
            this.generateOffer(ofertaAluno);
        });
    }
}

function ofertaAluno(erro, ofertaSDP) {
    if (erro) return onError(erro)

    var mensagem = {
        id : 'aluno',
        ofertaSDP : ofertaSDP
    }
    enviarMensagem(mensagem);
}

function tratarEventoCandidatoICE(candidato) {
       console.log('Candidato ' + JSON.stringify(candidato));

       var mensagem = {
          id : 'candidatoICE',
          candidato : candidato
       }
       enviarMensagem(mensagem);
}

function parar() {
    if (webRtcPeer) {
        var mensagem = {
                id : 'parar'
        }
        enviarMensagem(mensagem);
        liberarRecursos();
    }
}

function liberarRecursos() {
    if (webRtcPeer) {
        webRtcPeer.dispose();
        webRtcPeer = null;
    }
    ocultarAguarde(video);
}

function enviarMensagem(mensagem) {
    var mensagemJson = JSON.stringify(mensagem);
    console.log('Enviando mensagem: ' + mensagemJson);
    ws.send(mensagemJson);
}

function exibirAguarde() {
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].poster = './img/transparent-1px.png';
        arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
    }
}

function ocultarAguarde() {
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].src = '';
        arguments[i].poster = './img/webrtc.png';
        arguments[i].style.background = '';
    }
}
