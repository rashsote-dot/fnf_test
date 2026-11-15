local popupX = 290
local popupY = 40

function onEvent(name, value1, value2)

    if name == 'PopUp' then

        local imageName = value1

        makeLuaSprite('popupImage', 'pop-ups/'..imageName, popupX, popupY)

        setObjectCamera('popupImage', 'other')

        scaleObject('popupImage', 2.7, 2.7)

        setProperty('popupImage.alpha', 1)

        addLuaSprite('popupImage', true)

        doTweenX('popupScaleX', 'popupImage.scale', 3.9, 1, 'quadOut')
        doTweenY('popupScaleY', 'popupImage.scale', 3.9, 1, 'quadOut')

        doTweenAlpha('popupFade', 'popupImage', 0, 1, 'linear')

    end

end

function onTweenCompleted(tag)

    if tag == 'popupFade' then
        removeLuaSprite('popupImage', true)
    end

end