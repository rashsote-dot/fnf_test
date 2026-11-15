local enabled = false
local lastImage = 0

function onCreate()
    for i = 1,5 do
        makeLuaSprite('img'..i, 'dropimages/image'..i, 120, 0)
        setObjectCamera('img'..i, 'hud')
        scaleObject('img'..i, 2.7, 2.7)
        setProperty('img'..i..'.alpha', 0)
        addLuaSprite('img'..i, true)

    end
end

function onEvent(name, value1, value2)
    if name == 'Screamers' then
        if value1 == 'on' then
            enabled = true
        elseif value1 == 'off' then
            enabled = false

            for i = 1,5 do
                setProperty('img'..i..'.alpha', 0)
            end
        end
    end
end

function onBeatHit()
    if enabled then
        local newImage = lastImage

        while newImage == lastImage do
            newImage = getRandomInt(1, 5)
        end

        lastImage = newImage

        for i = 1,5 do
            setProperty('img'..i..'.alpha', 0)
        end

        setProperty('img'..newImage..'.alpha', 0.3)
    end
end