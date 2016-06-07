EstudeAi.api  = new EstudeAi.Api('localhost:3000');

window.onload = function() {
    document.getElementById('criar-sala').addEventListener('click', function () {
        EstudeAi.api.criarSala(document.getElementById('id-sala').value, function(data) {
            console.log(data);
        });
    });
};
