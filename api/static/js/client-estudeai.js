if(typeof EstudeAi == "undefined") { EstudeAi = {}; }

EstudeAi.Api = function(servidor) {
  this.servidor = servidor;
  this.timeoutPadrao = 10000;

  this.apiEndpoint = function(url) {
    return "http://" + servidor + url;
  };

  this.chamar = function(metodoHttp, url, dados, cbSucesso, cbErro) {
    jQuery.ajax({
      'url'     : this.apiEndpoint(url),
      'success' : cbSucesso,
      'error'   : cbErro,
      'data'    : dados,
      'dataType': 'json'
    });
  };

  this.criarSala = function(idSala, cb, cbErro) {
    this.chamar('GET', '/rooms/create', { "room_id" : idSala }, cb, cbErro);
  };
};
