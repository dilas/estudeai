FROM odilontalk/ubuntu-webrtc
MAINTAINER Odilon Alves <odilontalk@gmail.com>

COPY provision/redis.conf /etc/redis/redis.conf
COPY provision/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN mkdir -p /apps /var/lock/apache2 /var/run/apache2 /var/run/sshd /var/log/supervisor
RUN cat /etc/hosts | sed '/::1/d' | tee /etc/hosts > /dev/null

RUN mkdir -p /apps/app1
COPY app1/ /apps/app1/
WORKDIR /apps/app1
RUN npm install

EXPOSE 22 80 3000 8888

VOLUME [ "/apps", "/var/www/html", "/apps/app1/node_modules" ]

CMD [ "/usr/bin/supervisord" ]
