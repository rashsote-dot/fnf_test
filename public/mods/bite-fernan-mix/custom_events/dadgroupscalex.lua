function onEvent(name, value1, value2)
	if name == 'DadGroupScaleX' then
		doTweenX('DadGroupScaleX', 'dadGroup.scale', value1, value2, 'Sine')
	end
end