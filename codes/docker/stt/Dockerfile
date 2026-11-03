# whisper.cpp server dibangun dari sumber pada tag terkunci. Model (ggml-<STT_MODEL>.bin) TIDAK diunduh
# saat runtime: salin manual ke volume whisper_models (lihat scripts/pull-models.sh|.ps1).
ARG WHISPER_TAG=v1.7.6

FROM alpine:3.22 AS build
ARG WHISPER_TAG
RUN apk add --no-cache build-base cmake git linux-headers
WORKDIR /src
RUN git clone --depth 1 --branch ${WHISPER_TAG} https://github.com/ggml-org/whisper.cpp.git .
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build build -j"$(nproc)" --target whisper-server

FROM alpine:3.22
RUN apk add --no-cache libstdc++ libgomp
COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
# Pustaka bersama bila dibangun sebagai shared (ggml/whisper).
COPY --from=build /src/build/src/libwhisper.so* /usr/local/lib/
COPY --from=build /src/build/ggml/src/libggml*.so* /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib STT_MODEL=base
USER 1000:1000
EXPOSE 8080
CMD ["sh", "-c", "exec whisper-server -m /models/ggml-${STT_MODEL}.bin --host 0.0.0.0 --port 8080"]
