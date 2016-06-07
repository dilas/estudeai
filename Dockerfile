FROM odilontalk/ubuntu-webrtc
MAINTAINER Odilon Alves <odilontalk@gmail.com>

COPY provision/redis.conf /etc/redis/redis.conf
COPY provision/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN mkdir -p /apps /var/lock/apache2 /var/run/apache2 /var/run/sshd /var/log/supervisor
RUN cat /etc/hosts | sed '/::1/d' | tee /etc/hosts > /dev/null

ENV REFRESHED 2016-06-07
WORKDIR /apps
RUN git clone https://github.com/dilas/estudeai.git

WORKDIR /apps/estudeai/api
RUN npm install

WORKDIR /apps/estudeai/api.sala
RUN npm install

EXPOSE 22 80 3000 8443 8888

VOLUME [ "/apps", "/var/www/html", "/apps/estudeai/api/node_modules", "/apps/estudeai/api.sala/node_modules" ]

CMD [ "/usr/bin/supervisord" ]
